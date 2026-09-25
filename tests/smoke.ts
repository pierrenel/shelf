import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { openDatabase, Store } from '../server/db.js';
import { createApp } from '../server/app.js';
import { Worker } from '../server/worker.js';
// Synthetic pages exercise difficult capture conditions without depending on third-party uptime.
const fixtures = [
    { path: 'blog', title: 'A field guide to noticing', color: '#ede4ce', ink: '#29453c', subtitle: 'Notes from the ordinary world.', body: 'There is a whole world in the things we almost walk past. A small collection of observations, walks and unexpected discoveries.' },
    { path: 'portfolio', title: 'PLAY IS THE PROCESS', color: '#d3ff53', ink: '#18332f', subtitle: 'Experiments in motion & interaction.', body: 'A synthetic GSAP-style portfolio fixture. Creative coding, movement and things that respond to you.' },
    { path: 'shop', title: 'Objects for everyday', color: '#e1a88e', ink: '#542818', subtitle: 'Fewer things. Better company.', body: 'A synthetic Shopify-style storefront fixture. Thoughtfully made objects for the home and the days in between.' },
    { path: 'docs', title: 'Build something useful.', color: '#c2d4ed', ink: '#1b3455', subtitle: 'The practical guide.', body: 'Quasar notebooks and documentation. Everything you need to begin: clear examples, small steps and space to explore.' },
    { path: 'cookies', title: 'OFF THE BEATEN PATH', color: '#7d5a92', ink: '#fff2e2', subtitle: 'Stories worth getting lost in.', body: 'A magazine about curious places and people. A synthetic cookie-banner fixture for capture testing.' },
];
const fixture = createServer((req, res) => {
    const name = req.url?.split('?')[0].slice(1);
    const item = fixtures.find(f => f.path === name);
    if (!item) {
        res.writeHead(404);
        res.end('Missing fixture');
        return;
    }
    res.setHeader('Content-Type', 'text/html');
    res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><title>${item.title}</title><meta name="description" content="${item.body}"><style>*{box-sizing:border-box}body{margin:0;background:${item.color};color:${item.ink};font:20px system-ui}header{padding:45px 65px;display:flex;justify-content:space-between;border-bottom:1px solid currentColor}main{padding:65px}h1{font-size:110px;line-height:1;max-width:950px;font-weight:550;letter-spacing:-6px;margin:60px 0 36px}p{line-height:1.8;max-width:680px}small{font-size:16px}.block{margin-top:80px;padding:60px;background:${item.ink};color:${item.color};min-height:500px}.reveal{opacity:0;transform:translateY(50px)}#cookie-banner{position:fixed;inset:0;background:#111e;color:white;z-index:99;padding:160px}footer{padding:60px}</style><header><b>${item.path.toUpperCase()} / TEST FIXTURE</b><span>Explore &nbsp; About &nbsp; Journal</span></header><main><small>${item.subtitle}</small><h1>${item.title}</h1><p>${item.body}</p><div class="block ${name === 'portfolio' ? 'reveal' : ''}"><h2>A different perspective.</h2><p>More to discover below the fold. This content appears after scrolling.</p></div>${name === 'docs' ? '<div style="height:17500px">Long documentation fixture with quasar search text.</div>' : ''}</main>${name === 'cookies' ? '<div id="cookie-banner"><h2>We use cookies</h2><button onclick="this.parentElement.remove()">Accept all cookies</button></div>' : ''}<footer>Synthetic content for automated testing.</footer><script>${name === 'portfolio' ? 'window.gsap={};new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.style.opacity=1;e.target.style.transform="none"}})).observe(document.querySelector(".reveal"));' : ''}${name === 'shop' ? 'window.Shopify={};' : ''}</script></html>`);
});
await new Promise<void>(resolve => fixture.listen(0, '127.0.0.1', resolve));
const fixturePort = (fixture.address() as {
    port: number;
}).port;
const directory = await mkdtemp(path.join(tmpdir(), 'shelf-smoke-'));
const store = new Store(openDatabase(directory));
let worker: Worker;
const { app, notify } = createApp(store, directory, () => worker?.connected || false);
worker = new Worker(store, directory, notify, 2, 16000, false);
await worker.start();
const origin = await app.listen({ host: '127.0.0.1', port: 0 });
const output = process.env.REVIEW_DIR || 'test-results';
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const consoleErrors: string[] = [];
    page.on('pageerror', e => consoleErrors.push(e.message));
    await page.goto(origin);
    await page.getByText('Good finds deserve a home.').waitFor();
    await page.screenshot({ path: path.join(output, 'empty-desktop.png'), fullPage: true });
    const ids: string[] = [];
    for (const f of fixtures) {
        const result = await fetch(origin + '/api/items', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: `http://127.0.0.1:${fixturePort}/${f.path}`, source: 'hermes', note: `Synthetic ${f.path} fixture for the acceptance test.` }) });
        assert.equal(result.status, 201);
        ids.push((await result.json() as {
            id: string;
        }).id);
    }
    const deadline = Date.now() + 150000;
    while (Date.now() < deadline && !ids.every(id => store.item(id)?.status === 'done')) {
        const failed = ids.find(id => store.item(id)?.status === 'failed');
        if (failed)
            throw new Error(store.item(failed)?.error || 'Capture failed');
        await new Promise(r => setTimeout(r, 500));
    }
    assert.ok(ids.every(id => store.item(id)?.status === 'done'), 'all five captures finish');
    for (const id of ids) {
        const item = store.item(id)!;
        const full = await sharp(path.join(directory, item.full_path!.slice(1))).metadata();
        assert.equal(full.width, 1440);
        assert.equal(full.height, item.full_h);
        assert.ok(item.thumb_path);
    }
    assert.equal(store.item(ids[3])?.clipped, true);
    assert.equal(store.item(ids[3])?.full_h, 16000);
    assert.ok(store.item(ids[1])?.tech.includes('gsap'));
    assert.ok(store.item(ids[2])?.tech.includes('shopify'));
    assert.ok(store.item(ids[1])?.tags.includes('gsap'));
    assert.ok(store.item(ids[2])?.tags.includes('shopify'));
    assert.ok(['dark', 'light', 'monochrome', 'colourful'].some(mood => store.item(ids[0])?.tags.includes(mood)));
    await page.waitForFunction(() => document.querySelectorAll('.bookmark').length === 5);
    await page.locator('.preview>img').first().waitFor();
    await page.evaluate(async () => { await Promise.all([...document.images].map(image => image.decode().catch(() => { }))); });
    await page.screenshot({ path: path.join(output, 'desktop.png'), fullPage: true });
    await page.getByRole('button', { name: 'Switch colour theme' }).click();
    await page.screenshot({ path: path.join(output, 'light-desktop.png'), fullPage: true });
    await page.getByRole('button', { name: 'Switch colour theme' }).click();
    await page.getByRole('textbox', { name: 'Search your collection' }).fill('quasar');
    await page.waitForFunction(() => document.querySelectorAll('.bookmark').length === 1);
    await page.getByRole('button', { name: 'Clear search' }).click();
    await page.waitForFunction(() => document.querySelectorAll('.bookmark').length === 5);
    await page.locator(`a.bookmark[href="/item/${ids[0]}"]`).click();
    await page.getByRole('dialog').waitFor();
    await page.locator('.full-shot').waitFor();
    await page.getByLabel('Why you saved it').fill('Remember this beautiful walking guide');
    await page.getByRole('heading', { name: 'Tags', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.note-status')?.textContent === 'Saved');
    assert.equal(store.item(ids[0])?.note, 'Remember this beautiful walking guide');
    await page.getByRole('button', { name: 'Favourite', exact: true }).click();
    await page.getByRole('button', { name: 'Favourited', exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, 'detail-desktop.png') });
    await page.getByLabel('Why you saved it').fill('A note saved by pressing Escape');
    await page.keyboard.press('Escape');
    await page.waitForURL(origin + '/');
    assert.equal(store.item(ids[0])?.note, 'A note saved by pressing Escape');
    assert.equal(new URL(page.url()).pathname, '/');
    await page.locator(`a.bookmark[href="/item/${ids[0]}"]`).click();
    await page.getByLabel('Why you saved it').fill('Keep this draft if the network fails');
    await page.route(`**/api/items/${ids[0]}`, async route => {
        if (route.request().method() === 'PATCH') await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Test connection failure'})});
        else await route.continue();
    });
    await page.keyboard.press('Escape');
    await page.getByText('Could not save — try again').waitFor();
    assert.equal(await page.getByRole('dialog').count(), 1);
    assert.equal(await page.getByLabel('Why you saved it').inputValue(), 'Keep this draft if the network fails');
    await page.unroute(`**/api/items/${ids[0]}`);
    await page.keyboard.press('Escape');
    await page.waitForURL(origin + '/');
    assert.equal(store.item(ids[0])?.note, 'Keep this draft if the network fails');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => Math.abs((document.querySelector('.bookmark') as HTMLElement).getBoundingClientRect().width - 350) < 1);
    await page.screenshot({ path: path.join(output, 'mobile.png'), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'mobile does not overflow');
    await page.locator('.bookmark').first().click();
    await page.locator('.full-shot').waitFor();
    await page.screenshot({ path: path.join(output, 'detail-mobile.png') });
    await page.locator('.detail-sidebar').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, 'detail-mobile-sidebar.png') });
    await page.getByRole('button', { name: 'Close detail' }).click();
    await page.getByRole('link', { name: 'Ways to save' }).click();
    await page.getByRole('heading', { name: 'Send a link with Hermes' }).waitFor();
    await page.evaluate(() => {
        Object.defineProperty(navigator, 'clipboard', {value:undefined,configurable:true});
        document.execCommand = () => false;
    });
    await page.getByRole('button', {name:'Copy example'}).click();
    await page.getByRole('status').filter({hasText:'Select and copy the example above.'}).waitFor();
    await page.getByRole('button', {name:'Dismiss notification'}).click();
    assert.ok((await page.locator('.bookmarklet').getAttribute('href'))?.startsWith('javascript:'));
    await page.screenshot({ path: path.join(output, 'settings-mobile.png'), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(consoleErrors, []);
    // Repeated Hermes requests are idempotent and the bookmarklet uses the same intake path.
    const popup = await browser.newPage();
    await popup.goto(origin + `/add?url=${encodeURIComponent(`http://127.0.0.1:${fixturePort}/blog`)}`);
    await popup.getByText('Already on your shelf.').waitFor();
    await popup.close();
    const oldPath = store.item(ids[0])!.full_path;
    await fetch(`${origin}/api/items/${ids[0]}/recapture`, { method: 'POST' });
    assert.equal(store.item(ids[0])!.full_path, oldPath);
    const recaptureDeadline = Date.now() + 30000;
    while (Date.now() < recaptureDeadline && store.item(ids[0])?.status !== 'done')
        await new Promise(r => setTimeout(r, 250));
    assert.equal(store.item(ids[0])?.status, 'done');
    assert.notEqual(store.item(ids[0])!.full_path, oldPath);
    await writeFile(path.join(output, 'smoke.json'), JSON.stringify({ passed: true, fixtures: fixtures.map(f => f.path), checks: ['capture', 'dimensions', 'clipping', 'tech detection', 'SSE', 'search', 'notes', 'favourites', 'theme', 'responsive layout', 'bookmarklet', 'Hermes dedupe', 'immutable recapture'], consoleErrors }, null, 2));
    console.log('PASS: five capture fixtures, gallery, detail, mobile, search, notes, favourites, bookmarklet, Hermes dedupe and immutable recapture.');
}
finally {
    await browser.close();
    await worker.stop();
    await app.close();
    store.db.close();
    await new Promise<void>(resolve => fixture.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
}
