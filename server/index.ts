import path from 'node:path';
import { openDatabase, Store } from './db.js';
import { createApp } from './app.js';
import { Worker } from './worker.js';
import { createTaggerFromEnv } from './tagger.js';
const data = path.resolve(process.env.DATA_DIR || './data');
const store = new Store(openDatabase(data));
let worker: Worker;
const { app, notify } = createApp(store, data, () => worker?.connected || false);
const integer = (key: string, fallback: number, min: number, max: number) => Math.min(max, Math.max(min, Number.parseInt(process.env[key] || '', 10) || fallback));
const tagger = createTaggerFromEnv();
worker = new Worker(store, data, notify, integer('CAPTURE_CONCURRENCY', 2, 1, 8), integer('MAX_FULLPAGE_HEIGHT', 16000, 900, 25000), process.env.CAPTURE_REPAIR === 'true', tagger);
await worker.start();
await app.listen({ port: integer('PORT', 3000, 1, 65535), host: '0.0.0.0' });
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, () => {
        if (stopping)
            return;
        stopping = true;
        void worker.stop().then(() => app.close()).then(() => store.db.close()).then(() => process.exit(0));
    });
