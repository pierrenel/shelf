import { chromium, type Browser, type BrowserContext } from 'playwright';
import sharp from 'sharp';
import { youtubeVideo } from '../shared/youtube.js';
import { extractArticle } from './article.js';
import path from 'node:path';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { blockedHosts, consentSelectors, detectors } from './capture-rules.js';
import { heuristicTags } from './heuristic.js';
import { normalizeUrl, ulid } from './normalize.js';
import { Store } from './db.js';
import type { Tagger } from './tagger.js';
export class Worker {
    private browser?: Browser;
    private launching?: Promise<Browser>;
    private timer?: NodeJS.Timeout;
    private jobs = new Map<string, Promise<void>>();
    private tagging = new Map<string, Promise<void>>();
    private stopping = false;
    constructor(private store: Store, private data: string, private notify: () => void, private concurrency = 2, private maxHeight = 16000, private repair = false, private tagger: Tagger | null = null) { }
    get connected() { return !!this.browser?.isConnected(); }
    async start() {
        this.store.db.prepare("UPDATE items SET status='queued' WHERE status='capturing'").run();
        this.store.db.prepare("UPDATE items SET tagging_status='pending' WHERE tagging_status='tagging'").run();
        await this.getBrowser();
        this.timer = setInterval(() => this.tick(), 750);
        this.tick();
    }
    private async getBrowser() {
        if (this.browser?.isConnected())
            return this.browser;
        if (!this.launching)
            this.launching = chromium.launch({ headless: true }).then(browser => {
                this.browser = browser;
                return browser;
            }).finally(() => { this.launching = undefined; });
        return this.launching;
    }
    private tick() {
        if (this.stopping)
            return;
        while (this.jobs.size < this.concurrency) {
            const row = this.store.db.prepare("SELECT id FROM items WHERE status='queued' AND next_attempt_at<=? ORDER BY created_at,id LIMIT 1").get(Date.now()) as {
                id: string;
            } | undefined;
            if (!row)
                break;
            this.store.db.prepare("UPDATE items SET status='capturing', attempts=attempts+1 WHERE id=?").run(row.id);
            const job = this.capture(row.id).finally(() => { this.jobs.delete(row.id); });
            this.jobs.set(row.id, job);
            this.notify();
        }
        while (this.tagger && this.tagging.size < 1) {
            const row = this.store.db.prepare("SELECT id FROM items WHERE tagging_status='pending' AND status='done' AND viewport_path IS NOT NULL ORDER BY captured_at,id LIMIT 1").get() as {
                id: string;
            } | undefined;
            if (!row)
                break;
            this.store.update(row.id, { tagging_status: 'tagging' });
            const job = this.tagItem(row.id).finally(() => { this.tagging.delete(row.id); });
            this.tagging.set(row.id, job);
        }
    }
    async stop() {
        this.stopping = true;
        clearInterval(this.timer);
        await this.browser?.close();
        await Promise.allSettled([...this.jobs.values(), ...this.tagging.values()]);
    }
    private async capture(id: string) {
        const started = Date.now();
        const item = this.store.item(id)!;
        const captureId = ulid();
        const folder = path.join(this.data, 'shots', id);
        let context: BrowserContext | undefined;
        const written: string[] = [];
        try {
            const browser = await this.getBrowser();
            context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'no-preference',
                userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36' });
            context.setDefaultTimeout(10000);
            // Hard deadline also covers pathological pages whose JS never settles.
            const deadline = setTimeout(() => void context?.close().catch(() => { }), 100000);
            context.once('close', () => clearTimeout(deadline));
            await context.route('**/*', route => {
                const host = new URL(route.request().url()).hostname;
                return blockedHosts.some(blocked => host === blocked || host.endsWith(`.${blocked}`)) ? route.abort() : route.continue();
            });
            const page = await context.newPage();
            const response = await page.goto(item.url, { waitUntil: 'load', timeout: 30000 });
            if (response && response.status() >= 400)
                throw new Error(`The site returned HTTP ${response.status()}. Your URL is still saved.`);
            await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => { });
            const accept = page.getByRole('button', { name: /^(accept all|accept all cookies|accept cookies|allow all)$/i }).first();
            if (await accept.isVisible().catch(() => false))
                await accept.click({ timeout: 1200 }).catch(() => { });
            await page.addStyleTag({ content: `${consentSelectors}{display:none!important}` });
            const viewport = await page.screenshot({ animations: 'disabled', timeout: 10000 });
            for (let scroll = 720; scroll <= 25000; scroll += 720) {
                const height = await page.evaluate(() => document.documentElement.scrollHeight);
                if (scroll > height)
                    break;
                await page.evaluate(y => window.scrollTo(0, y), scroll);
                await page.waitForTimeout(250);
            }
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.waitForTimeout(1000);
            if (this.repair)
                await page.evaluate(() => {
                    let fixed = 0;
                    for (const element of document.querySelectorAll<HTMLElement>('body *')) {
                        const style = getComputedStyle(element);
                        if (['fixed', 'sticky'].includes(style.position) && fixed++ > 0)
                            element.style.setProperty('position', 'absolute', 'important');
                        if (style.opacity === '0' && style.display !== 'none' && style.visibility !== 'hidden') {
                            element.style.setProperty('opacity', '1', 'important');
                            element.style.setProperty('transform', 'none', 'important');
                        }
                    }
                });
            const height = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, 900));
            const fullHeight = Math.min(height, this.maxHeight);
            const full = await page.screenshot({ fullPage: true, clip: { x: 0, y: 0, width: 1440, height: fullHeight }, animations: 'disabled', timeout: 15000 });
            const metadata = await page.evaluate(rules => {
                const meta = (name: string) => document.querySelector<HTMLMetaElement>(`meta[property="${name}"],meta[name="${name}"]`)?.content || null;
                const scripts = [...document.scripts].map(s => s.src).join(' ');
                const globals = window as unknown as Record<string, unknown>;
                const tech = rules.filter(rule => (rule.global && globals[rule.global]) || scripts.includes(rule.pattern)).map(rule => rule.name);
                if (document.querySelector('astro-island') && !tech.includes('astro'))
                    tech.push('astro');
                try {
                    if ([...document.querySelectorAll('canvas')].some(canvas => canvas.getContext('webgl') || canvas.getContext('webgl2')))
                        tech.push('webgl');
                }
                catch { /* Some canvases reject a second context. */ }
                return { title: meta('og:title') || document.title, description: meta('description') || meta('og:description'), site_name: meta('og:site_name'),
                    og_image_url: meta('og:image'), canonical: document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href || location.href,
                    favicon: document.querySelector<HTMLLinkElement>('link[rel~="icon"]')?.href || new URL('/favicon.ico', location.href).href,
                    page_text: document.body.innerText.slice(0, 5000), tech };
            }, detectors);
            if (/^(just a moment|attention required|access denied|verify you are human)/i.test(metadata.title || ''))
                throw new Error('This site blocked automated capture. Your URL is saved; you can retry later.');
            const article = youtubeVideo(item.url) ? null : await extractArticle(page).catch(error => {
                console.warn(JSON.stringify({ event: 'article', id, error: String(error) }));
                return null;
            });
            await mkdir(folder, { recursive: true });
            const save = async (name: string, buffer: Buffer) => {
                const filename = `${name}-${captureId}.${name === 'favicon' ? 'png' : 'webp'}`;
                const destination = path.join(folder, filename);
                written.push(destination);
                await import('node:fs/promises').then(fs => fs.writeFile(destination, buffer));
                return `/shots/${id}/${filename}`;
            };
            const [fullPath, viewportPath, thumbPath] = await Promise.all([
                sharp(full).webp({ quality: 80 }).toBuffer().then(buffer => save('full', buffer)),
                sharp(viewport).webp({ quality: 82 }).toBuffer().then(buffer => save('viewport', buffer)),
                sharp(viewport).resize(600).webp({ quality: 80 }).toBuffer().then(buffer => save('thumb', buffer)),
            ]);
            let faviconPath: string | null = null;
            try {
                const favicon = await context.request.get(metadata.favicon, { timeout: 5000 });
                const body = await favicon.body();
                if (favicon.ok() && body.length <= 1024 * 1024)
                    faviconPath = await save('favicon', await sharp(body, { limitInputPixels: 1000000 }).resize(32, 32).png().toBuffer());
            }
            catch { /* A missing icon never invalidates a capture. */ }
            const pixels = await sharp(viewport).resize(50, 50, { fit: 'fill' }).removeAlpha().raw().toBuffer();
            const buckets = new Map<string, number>();
            for (let i = 0; i < pixels.length; i += 3) {
                const hex = '#' + [...pixels.subarray(i, i + 3)].map(n => Math.min(255, Math.round(n / 32) * 32).toString(16).padStart(2, '0')).join('');
                buckets.set(hex, (buckets.get(hex) || 0) + 1);
            }
            const palette = [...buckets].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([hex]) => hex);
            if (!this.store.item(id)) {
                await Promise.all(written.map(file => rm(file, { force: true })));
                return;
            }
            const { favicon: _favicon, canonical, tech, ...fields } = metadata;
            this.store.db.transaction(() => {
                this.store.update(id, { ...fields,
                    ...(article ? { article_json: JSON.stringify(article), reading_minutes: article.minutes, page_text: article.text } : item.article ? { page_text: item.article.text } : {}),
                    tech: JSON.stringify(tech), palette: JSON.stringify(palette), favicon_path: faviconPath,
                    full_path: fullPath, full_w: 1440, full_h: fullHeight, viewport_path: viewportPath, thumb_path: thumbPath, thumb_w: 600, thumb_h: 375,
                    captured_at: new Date().toISOString(), status: 'done', error: null, clipped: Number(height > fullHeight), capture_repair: Number(this.repair), tagging_status: this.tagger ? 'pending' : 'done', tagging_error: null });
                this.store.db.prepare("DELETE FROM item_tags WHERE item_id=? AND origin='auto'").run(id);
                this.store.tag(id, heuristicTags({ domain: item.domain, tech, palette }), 'auto');
                try {
                    const normalized = normalizeUrl(canonical);
                    // Only trust canonical declarations on the same site. Aliases avoid breaking saved IDs on collisions.
                    if (new URL(normalized).hostname === item.domain)
                        this.store.db.prepare('INSERT OR IGNORE INTO url_aliases VALUES (?,?)').run(normalized, id);
                }
                catch { /* Ignore malformed site-provided canonicals. */ }
            })();
            console.log(JSON.stringify({ event: 'capture', id, outcome: 'done', duration_ms: Date.now() - started }));
        }
        catch (error) {
            await Promise.all(written.map(file => rm(file, { force: true }).catch(() => { })));
            const message = error instanceof Error ? error.message.slice(0, 1000) : 'Capture failed.';
            const retry = item.attempts < 3;
            this.store.update(id, { status: retry ? 'queued' : 'failed', error: message, next_attempt_at: Date.now() + 5000 * 2 ** item.attempts });
            console.log(JSON.stringify({ event: 'capture', id, outcome: retry ? 'retry' : 'failed', duration_ms: Date.now() - started, error: message }));
        }
        finally {
            await context?.close().catch(() => { });
            this.notify();
        }
    }
    private async tagItem(id: string) {
        const started = Date.now();
        const item = this.store.item(id);
        if (!item || !this.tagger || !item.viewport_path) {
            this.store.update(id, { tagging_status: 'done' });
            this.notify();
            return;
        }
        try {
            const image = await readFile(path.join(this.data, item.viewport_path.replace(/^\//, '')));
            const existing = this.store.db.prepare('SELECT name FROM tags JOIN item_tags ON tags.id=tag_id GROUP BY tags.id ORDER BY count(*) DESC, name LIMIT 100').all() as {
                name: string;
            }[];
            const result = await this.tagger.tag({ image, mime: 'image/webp', title: item.title, description: item.description, domain: item.domain, pageText: item.page_text, existingTags: existing.map(row => row.name) });
            if (!this.store.item(id))
                return;
            if (!result)
                this.store.update(id, { tagging_status: 'done', tagging_error: 'Model response could not be parsed.' });
            else
                this.store.db.transaction(() => {
                    this.store.update(id, { summary: result.summary, tagging_status: 'done', tagging_error: null });
                    this.store.tag(id, [...result.tags, result.category], 'auto');
                })();
            console.log(JSON.stringify({ event: 'tag', id, outcome: result ? 'done' : 'parse_failed', duration_ms: Date.now() - started }));
        }
        catch (error) {
            const message = error instanceof Error ? error.message.slice(0, 1000) : 'Tagging failed.';
            this.store.update(id, { tagging_status: 'failed', tagging_error: message });
            console.log(JSON.stringify({ event: 'tag', id, outcome: 'failed', duration_ms: Date.now() - started, error: message }));
        }
        finally {
            this.notify();
        }
    }
}
