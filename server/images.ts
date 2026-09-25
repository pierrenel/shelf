import sharp from 'sharp';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { heuristicTags } from './heuristic.js';
import { ulid } from './normalize.js';
import { Store } from './db.js';
export async function paletteFrom(buffer: Buffer) {
    const pixels = await sharp(buffer).resize(50, 50, { fit: 'fill' }).removeAlpha().raw().toBuffer();
    const buckets = new Map<string, number>();
    for (let i = 0; i < pixels.length; i += 3) {
        const hex = '#' + [...pixels.subarray(i, i + 3)].map(n => Math.min(255, Math.round(n / 32) * 32).toString(16).padStart(2, '0')).join('');
        buckets.set(hex, (buckets.get(hex) || 0) + 1);
    }
    return [...buckets].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([hex]) => hex);
}
export async function applyCover(store: Store, data: string, id: string, buffer: Buffer, maxHeight = 16000) {
    const item = store.item(id);
    if (!item)
        throw Object.assign(new Error('Bookmark not found.'), { statusCode: 404 });
    if (item.status === 'capturing')
        throw Object.assign(new Error('Wait for the preview to finish before replacing it.'), { statusCode: 409 });
    if (!buffer.length)
        throw Object.assign(new Error('Paste or choose an image.'), { statusCode: 400 });
    try {
        const source = sharp(buffer, { limitInputPixels: 40000000, failOn: 'none' }).rotate();
        const meta = await source.metadata();
        if (!meta.width || !meta.height)
            throw Object.assign(new Error('That file doesn’t look like an image.'), { statusCode: 400 });
        const width = Math.min(meta.width, 1440);
        const resized = await source.resize({ width, withoutEnlargement: true }).toBuffer();
        const sized = await sharp(resized).metadata();
        const fullW = sized.width || width;
        const fullHUncapped = sized.height || meta.height;
        const fullH = Math.min(fullHUncapped, maxHeight);
        const viewH = Math.min(fullH, Math.max(1, Math.round(fullW * 900 / 1440)));
        const captureId = ulid();
        const folder = path.join(data, 'shots', id);
        await mkdir(folder, { recursive: true });
        const save = async (name: string, image: Buffer) => {
            const filename = `${name}-${captureId}.webp`;
            await writeFile(path.join(folder, filename), image);
            return `/shots/${id}/${filename}`;
        };
        const [fullPath, viewportPath, thumbPath] = await Promise.all([
            sharp(resized).extract({ left: 0, top: 0, width: fullW, height: fullH }).webp({ quality: 80 }).toBuffer().then(image => save('full', image)),
            sharp(resized).extract({ left: 0, top: 0, width: fullW, height: viewH }).webp({ quality: 82 }).toBuffer().then(image => save('viewport', image)),
            sharp(resized).extract({ left: 0, top: 0, width: fullW, height: viewH }).resize(600).webp({ quality: 80 }).toBuffer().then(image => save('thumb', image)),
        ]);
        const thumb = await sharp(path.join(folder, path.basename(thumbPath))).metadata();
        const palette = await paletteFrom(resized);
        const model = (process.env.TAGGER_PROVIDER || 'none') !== 'none' && !!process.env.TAGGER_MODEL;
        store.db.transaction(() => {
            store.update(id, {
                full_path: fullPath, full_w: fullW, full_h: fullH, viewport_path: viewportPath, thumb_path: thumbPath,
                thumb_w: thumb.width || 600, thumb_h: thumb.height || Math.round(600 * viewH / fullW),
                palette: JSON.stringify(palette), captured_at: new Date().toISOString(), status: 'done', error: null,
                clipped: Number(fullHUncapped > fullH), tagging_status: model ? 'pending' : 'done', tagging_error: null,
            });
            store.tag(id, heuristicTags({ domain: item.domain, tech: item.tech, palette }), 'auto');
        })();
        return store.item(id)!;
    }
    catch (error) {
        if ((error as {
            statusCode?: number;
        }).statusCode)
            throw error;
        throw Object.assign(new Error('Could not use that image.'), { statusCode: 400 });
    }
}
