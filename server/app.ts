import Fastify from 'fastify';
import { createReadStream, existsSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import type { ServerResponse } from 'node:http';
import { Store } from './db.js';
import { applyCover } from './images.js';
import { normalizeTag } from './normalize.js';
export function createApp(store: Store, data: string, browserReady: () => boolean = () => false) {
    const app = Fastify({ logger: true, bodyLimit: 32768 });
    app.addContentTypeParser(/^image\/(png|jpe?g|webp|gif)$/i, { parseAs: 'buffer', bodyLimit: 12 * 1024 * 1024 }, (_request, body, done) => done(null, body));
    const clients = new Set<ServerResponse>();
    const notify = () => { for (const client of clients)
        client.write('event: change\ndata: {}\n\n'); };
    app.addHook('onRequest', async (request, reply) => {
        if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && request.headers.origin) {
            const origin = new URL(request.headers.origin);
            if (origin.host !== request.headers.host)
                return reply.code(403).send({ error: 'Save through Shelf or its bookmarklet.' });
        }
    });
    app.setErrorHandler((error, _request, reply) => {
        const problem = error as {
            statusCode?: number;
            message?: string;
        };
        const status = problem.statusCode && problem.statusCode < 500 ? problem.statusCode : 500;
        app.log.error(error);
        reply.code(status).send({ error: status === 413 ? 'That screenshot is too large. Try a smaller image.' : status < 500 ? problem.message : 'Something went wrong. Please try again.' });
    });
    app.get('/api/health', async (_request, reply) => {
        const database = !!store.db.prepare('SELECT 1').get();
        const { queue } = store.db.prepare("SELECT count(*) AS queue FROM items WHERE status IN ('queued','capturing')").get() as {
            queue: number;
        };
        const browser = browserReady();
        return reply.code(database && browser ? 200 : 503).send({ database, browser, queue });
    });
    app.post<{
        Body: {
            url: string;
            note?: string;
            tags?: string[];
            source?: 'web' | 'bookmarklet' | 'shortcut' | 'hermes' | 'raindrop';
        };
    }>('/api/items', {
        schema: { body: { type: 'object', required: ['url'], additionalProperties: false, properties: {
                    url: { type: 'string', minLength: 1, maxLength: 8000 }, note: { type: 'string', maxLength: 10000 },
                    tags: { type: 'array', maxItems: 50, items: { type: 'string', maxLength: 100 } },
                    source: { enum: ['web', 'bookmarklet', 'shortcut', 'hermes', 'raindrop'] },
                } } },
    }, async (request, reply) => {
        try {
            const saved = store.save(request.body);
            notify();
            return reply.code(saved.duplicate ? 200 : 201).send({ ...saved.item, duplicate: saved.duplicate });
        }
        catch (error) {
            return reply.code(400).send({ error: error instanceof Error ? error.message : 'Invalid URL.' });
        }
    });
    app.get<{
        Querystring: Record<string, string>;
    }>('/api/items', async (request, reply) => {
        try {
            return store.list(request.query);
        }
        catch {
            return reply.code(400).send({ error: 'Invalid search or pagination cursor.' });
        }
    });
    app.get<{
        Params: {
            id: string;
        };
    }>('/api/items/:id', async (request, reply) => {
        const item = store.item(request.params.id);
        return item || reply.code(404).send({ error: 'Bookmark not found.' });
    });
    app.patch<{
        Params: {
            id: string;
        };
        Body: {
            note?: string;
            favourite?: boolean;
            archived?: boolean;
            add_tags?: string[];
            remove_tags?: string[];
        };
    }>('/api/items/:id', {
        schema: { body: { type: 'object', additionalProperties: false, properties: { note: { type: 'string', maxLength: 10000 }, favourite: { type: 'boolean' }, archived: { type: 'boolean' },
                    add_tags: { type: 'array', maxItems: 50, items: { type: 'string', maxLength: 100 } }, remove_tags: { type: 'array', maxItems: 50, items: { type: 'string', maxLength: 100 } } } } },
    }, async (request, reply) => {
        const { id } = request.params;
        if (!store.item(id))
            return reply.code(404).send({ error: 'Bookmark not found.' });
        store.db.transaction(() => {
            const { note, favourite, archived, add_tags, remove_tags } = request.body;
            store.update(id, { ...(note !== undefined ? { note } : {}), ...(favourite !== undefined ? { favourite: Number(favourite) } : {}), ...(archived !== undefined ? { archived: Number(archived) } : {}) });
            store.tag(id, add_tags || []);
            for (const name of remove_tags || [])
                store.db.prepare('DELETE FROM item_tags WHERE item_id=? AND tag_id=(SELECT id FROM tags WHERE name=?)').run(id, normalizeTag(name));
        })();
        notify();
        return store.item(id);
    });
    app.post<{
        Params: {
            id: string;
        };
    }>('/api/items/:id/recapture', async (request, reply) => {
        const item = store.item(request.params.id);
        if (!item)
            return reply.code(404).send({ error: 'Bookmark not found.' });
        if (item.status !== 'capturing' && item.status !== 'queued')
            store.update(item.id, { status: 'queued', attempts: 0, next_attempt_at: 0, error: null });
        notify();
        return reply.code(202).send(store.item(item.id));
    });
    app.post<{
        Params: {
            id: string;
        };
        Body: Buffer;
    }>('/api/items/:id/cover', { bodyLimit: 12 * 1024 * 1024 }, async (request, reply) => {
        if (!Buffer.isBuffer(request.body))
            return reply.code(415).send({ error: 'Send a PNG, JPEG, WebP or GIF.' });
        try {
            const item = await applyCover(store, data, request.params.id, request.body);
            notify();
            return item;
        }
        catch (error) {
            const problem = error as {
                statusCode?: number;
                message?: string;
            };
            return reply.code(problem.statusCode || 400).send({ error: problem.message || 'Could not use that image.' });
        }
    });
    app.delete<{
        Params: {
            id: string;
        };
    }>('/api/items/:id', async (request, reply) => {
        const item = store.item(request.params.id);
        if (!item)
            return reply.code(404).send({ error: 'Bookmark not found.' });
        if (item.status === 'capturing')
            return reply.code(409).send({ error: 'Wait for the preview to finish before deleting this bookmark.' });
        store.db.prepare('DELETE FROM items WHERE id=?').run(item.id);
        await rm(path.join(data, 'shots', item.id), { recursive: true, force: true });
        notify();
        return reply.code(204).send();
    });
    app.get('/api/tags', async () => store.db.prepare('SELECT name,count(DISTINCT item_id) AS count FROM tags JOIN item_tags ON tags.id=tag_id JOIN items ON items.id=item_id WHERE archived=0 GROUP BY tags.id ORDER BY count DESC,name').all());
    app.get('/api/events', (request, reply) => {
        reply.hijack();
        const client = reply.raw;
        client.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
        client.write('event: connected\ndata: {}\n\n');
        clients.add(client);
        const timer = setInterval(() => client.write(': heartbeat\n\n'), 15000);
        request.raw.on('close', () => { clearInterval(timer); clients.delete(client); });
    });
    app.addHook('onClose', async () => { for (const client of clients)
        client.end(); });
    app.get('/add', async (_request, reply) => reply.type('text/html').send(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Save to Shelf</title><style>body{font:16px system-ui;background:#20221f;color:#eceee7;padding:24px}button{font:inherit;padding:10px}</style><h1>Shelf</h1><p id="message">Saving your link…</p><button id="close" hidden>Close window</button><script src="/bookmarklet.js"></script></html>`));
    app.get('/bookmarklet.js', async (_request, reply) => reply.type('text/javascript').send(`const message=document.getElementById('message');const url=new URLSearchParams(location.search).get('url');document.getElementById('close').onclick=()=>window.close();if(!url){message.textContent='No URL provided. Use the Shelf bookmarklet on a page you want to save.';}else{fetch('/api/items',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url,source:'bookmarklet'})}).then(async r=>{const item=await r.json();if(!r.ok)throw new Error(item.error);message.textContent=item.duplicate?'Already on your shelf.':'Saved. Your preview will follow.';document.getElementById('close').hidden=false;setTimeout(()=>window.close(),1200);}).catch(e=>message.textContent=e.message);}`));
    app.get<{
        Params: {
            '*': string;
        };
    }>('/shots/*', async (request, reply) => {
        const suffix = request.params['*'];
        if (!/^[0-9A-Z]{26}\/(?:full|viewport|thumb|favicon)-[0-9A-Z]{26}\.(?:webp|png)$/.test(suffix))
            return reply.code(404).send();
        const file = path.join(data, 'shots', suffix);
        if (!existsSync(file))
            return reply.code(404).send();
        return reply.type(file.endsWith('.png') ? 'image/png' : 'image/webp').header('Cache-Control', 'public, max-age=31536000, immutable').send(createReadStream(file));
    });
    app.setNotFoundHandler(async (request, reply) => {
        if (request.method !== 'GET' || request.url.startsWith('/api/'))
            return reply.code(404).send({ error: 'Not found.' });
        const pathname = new URL(request.url, 'http://localhost').pathname;
        if (pathname.startsWith('/assets/')) {
            const filename = path.basename(pathname);
            const file = path.resolve('dist/web/assets', filename);
            if (!existsSync(file))
                return reply.code(404).send();
            return reply.type(filename.endsWith('.css') ? 'text/css' : 'text/javascript').header('Cache-Control', 'public,max-age=31536000,immutable').send(createReadStream(file));
        }
        if (!['/', '/settings'].includes(pathname) && !/^\/item\/[0-9A-Z]{26}$/.test(pathname))
            return reply.code(404).send({ error: 'Not found.' });
        return reply.type('text/html').header('Cache-Control', 'no-cache').send(await readFile('dist/web/index.html', 'utf8'));
    });
    return { app, notify };
}
