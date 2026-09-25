import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { Store, openDatabase } from '../server/db.js';
import { createApp } from '../server/app.js';
import { Worker } from '../server/worker.js';
const urls = process.argv.slice(2);
if (!urls.length)
    throw new Error('Pass explicit public URLs to this opt-in live capture test.');
const directory = await mkdtemp(path.join(tmpdir(), 'shelf-live-'));
const store = new Store(openDatabase(directory));
let worker: Worker;
const { app, notify } = createApp(store, directory, () => worker.connected);
worker = new Worker(store, directory, notify, 2, 16000, false);
await worker.start();
const origin = await app.listen({ host: '127.0.0.1', port: 0 });
const output = process.env.REVIEW_DIR || 'test-results';
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
try {
    const ids = urls.map(url => store.save({ url, note: 'Temporary live acceptance test; not part of your personal collection.' }).item.id);
    const deadline = Date.now() + 300000;
    while (Date.now() < deadline && !ids.every(id => ['done', 'failed'].includes(store.item(id)!.status)))
        await new Promise(r => setTimeout(r, 1000));
    const results = ids.map(id => { const item = store.item(id)!; return { url: item.url, title: item.title, status: item.status, error: item.error, width: item.full_w, height: item.full_h, clipped: item.clipped, tech: item.tech }; });
    await writeFile(path.join(output, 'live.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results, null, 2));
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    await page.goto(origin);
    await page.locator('.bookmark').first().waitFor();
    await page.evaluate(async () => { await Promise.all([...document.images].map(image => image.decode().catch(() => { }))); });
    await page.screenshot({ path: path.join(output, 'live-desktop.png'), fullPage: true });
    for (let i = 0; i < ids.length; i++) {
        await page.goto(`${origin}/item/${ids[i]}`);
        await page.locator('.detail-sidebar').waitFor();
        await page.evaluate(async () => { await Promise.all([...document.images].map(image => image.decode().catch(() => { }))); });
        await page.screenshot({ path: path.join(output, `live-detail-${i + 1}.png`) });
    }
    if (results.some(r => r.status !== 'done'))
        process.exitCode = 1;
}
finally {
    await browser.close();
    await worker.stop();
    await app.close();
    store.db.close();
    await rm(directory, { recursive: true, force: true });
}
