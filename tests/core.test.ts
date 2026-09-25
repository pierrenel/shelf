import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { normalizeUrl, normalizeTag, searchQuery, ulid } from '../server/normalize.js';
import { Store, openDatabase } from '../server/db.js';
import { createApp } from '../server/app.js';
import { masonry } from '../shared/masonry.js';
import sharp from 'sharp';
test('URL normalization removes trackers and fragments but preserves meaningful query order and path', () => {
    assert.equal(normalizeUrl(' HTTPS://Example.COM:443/a/?utm_source=mail&size=large#intro '), 'https://example.com/a/?size=large');
    assert.equal(normalizeUrl('https://example.com/a?b=2&a=1'), 'https://example.com/a?b=2&a=1');
    for (const url of ['javascript:alert(1)', 'file:///etc/passwd', 'https://user:pass@example.com', 'not a url'])
        assert.throws(() => normalizeUrl(url));
    assert.match(ulid(), /^[0-9A-HJKMNP-TV-Z]{26}$/);
});
test('tags normalise whitespace, Unicode and punctuation consistently', () => {
    assert.equal(normalizeTag('  Three.js  '), 'three-js');
    assert.equal(normalizeTag('Big TYPOGRAPHY!'), 'big-typography');
    assert.equal(normalizeTag('café'), 'café');
    assert.equal(normalizeTag('...'), '');
    assert.equal(searchQuery('orange "portfolio" OR *'), '"orange"* AND "portfolio"* AND "OR"*');
});
test('masonry preserves first-row chronology and places the next item in the shortest column without overlap', () => {
    const result = masonry([{ width: 600, height: 400 }, { width: 600, height: 800 }, { width: 600, height: 300 }, { width: 600, height: 400 }], 900);
    assert.equal(result.positions[0].top, 0);
    assert.equal(result.positions[1].top, 0);
    assert.equal(result.positions[2].top, 0);
    assert.equal(result.positions[3].left, result.positions[2].left);
    assert.ok(result.positions[3].top >= result.positions[2].height + 20);
    assert.ok(result.positions[0].height > 100);
    const mobile = masonry([{ width: 600, height: 375 }, { width: 600, height: 375 }], 350);
    assert.equal(mobile.positions[1].left, 0);
    assert.ok(mobile.positions[1].top > mobile.positions[0].height);
});
test('a pasted screenshot becomes the preview when capture is not running', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'shelf-cover-'));
    const store = new Store(openDatabase(directory));
    const { app } = createApp(store, directory, () => true);
    try {
        const saved = (await app.inject({ method: 'POST', url: '/api/items', payload: { url: 'https://www.shadertoy.com/view/example' } })).json();
        const png = await sharp({ create: { width: 120, height: 80, channels: 3, background: '#2266aa' } }).png().toBuffer();
        const cover = await app.inject({ method: 'POST', url: `/api/items/${saved.id}/cover`, headers: { 'content-type': 'image/png' }, payload: png });
        assert.equal(cover.statusCode, 200);
        const item = cover.json();
        assert.equal(item.status, 'done');
        assert.ok(item.thumb_path);
        assert.equal(item.full_w, 120);
        assert.equal(item.full_h, 80);
        store.update(saved.id, { status: 'capturing' });
        assert.equal((await app.inject({ method: 'POST', url: `/api/items/${saved.id}/cover`, headers: { 'content-type': 'image/png' }, payload: png })).statusCode, 409);
        assert.equal((await app.inject({ method: 'POST', url: `/api/items/${saved.id}/cover`, payload: { nope: true } })).statusCode, 415);
    }
    finally {
        await app.close();
        store.db.close();
        rmSync(directory, { recursive: true, force: true });
    }
});
test('durable intake, dedupe, FTS tag/note triggers, pagination, API validation and recapture preservation', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'shelf-test-'));
    const store = new Store(openDatabase(directory));
    const { app } = createApp(store, directory, () => true);
    try {
        const response = await app.inject({ method: 'POST', url: '/api/items', payload: { url: 'https://example.com/?utm_source=hermes', source: 'hermes', note: 'A useful orange animation tool', tags: ['Creative Coding'] } });
        assert.equal(response.statusCode, 201);
        const saved = response.json();
        assert.equal(saved.source, 'hermes');
        assert.equal(saved.status, 'queued');
        const duplicate = await app.inject({ method: 'POST', url: '/api/items', payload: { url: 'https://EXAMPLE.com/#intro' } });
        assert.equal(duplicate.statusCode, 200);
        assert.equal(duplicate.json().id, saved.id);
        assert.equal(duplicate.json().duplicate, true);
        assert.equal(store.list({ q: 'orange animation' }).total, 1);
        assert.equal(store.list({ q: 'creative coding' }).total, 1);
        await app.inject({ method: 'PATCH', url: `/api/items/${saved.id}`, payload: { note: 'Something completely different', remove_tags: ['creative-coding'], add_tags: ['reference'], favourite: true } });
        assert.equal(store.list({ q: 'orange' }).total, 0);
        assert.equal(store.list({ q: 'reference', favourite: 'true' }).total, 1);
        assert.equal(store.list({ q: 'creative' }).total, 0);
        store.save({ url: 'https://example.org/a' });
        store.save({ url: 'https://example.org/b' });
        const page = store.list({ limit: '2' });
        assert.equal(page.items.length, 2);
        assert.ok(page.next_cursor);
        const second = store.list({ limit: '2', cursor: page.next_cursor! });
        assert.equal(second.items.length, 1);
        assert.ok(!page.items.some(i => i.id === second.items[0].id));
        assert.equal((await app.inject({ method: 'POST', url: '/api/items', payload: { url: 'file:///etc/passwd' } })).statusCode, 400);
        assert.equal((await app.inject({ method: 'PATCH', url: `/api/items/${saved.id}`, payload: { note: { unexpected: true } } })).statusCode, 400);
        assert.equal((await app.inject({ method: 'POST', url: '/api/items', headers: { origin: 'https://elsewhere.test' }, payload: { url: 'https://example.org' } })).statusCode, 403);
        store.update(saved.id, { status: 'done', full_path: '/shots/old.webp', thumb_path: '/shots/old-thumb.webp' });
        assert.equal((await app.inject({ method: 'POST', url: `/api/items/${saved.id}/recapture` })).statusCode, 202);
        assert.equal(store.item(saved.id)?.full_path, '/shots/old.webp');
        await app.inject({ method: 'DELETE', url: `/api/items/${saved.id}` });
        assert.equal(store.list({ q: 'reference' }).total, 0);
        assert.equal((await app.inject({ method: 'GET', url: `/api/items/${saved.id}` })).statusCode, 404);
    }
    finally {
        await app.close();
        store.db.close();
        rmSync(directory, { recursive: true, force: true });
    }
});
