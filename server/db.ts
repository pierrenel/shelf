import Database from 'better-sqlite3';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { normalizeTag, normalizeUrl, searchQuery, ulid } from './normalize.js';
import type { Item, ItemPage } from '../shared/types.js';
export function openDatabase(directory: string) {
    mkdirSync(directory, { recursive: true });
    const db = new Database(path.join(directory, 'shelf.db'));
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');
    db.exec('CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY)');
    for (const file of readdirSync('migrations').filter(name => name.endsWith('.sql')).sort()) {
        if (!db.prepare('SELECT 1 FROM migrations WHERE name=?').get(file))
            db.transaction(() => {
                db.exec(readFileSync(path.join('migrations', file), 'utf8'));
                db.prepare('INSERT INTO migrations VALUES (?)').run(file);
            })();
    }
    return db;
}
export class Store {
    constructor(public db: Database.Database) { }
    item(id: string): Item | undefined {
        const row = this.db.prepare('SELECT * FROM items WHERE id=?').get(id) as Record<string, unknown> | undefined;
        if (!row)
            return;
        const tags = this.db.prepare('SELECT DISTINCT name FROM tags JOIN item_tags ON tags.id=item_tags.tag_id WHERE item_id=? ORDER BY name').all(id) as {
            name: string;
        }[];
        return { ...row, favourite: !!row.favourite, archived: !!row.archived, clipped: !!row.clipped, capture_repair: !!row.capture_repair,
            palette: JSON.parse(row.palette as string), tech: JSON.parse(row.tech as string), tags: tags.map(t => t.name) } as unknown as Item;
    }
    tag(id: string, names: string[], origin = 'manual') {
        for (const name of [...new Set(names.map(normalizeTag).filter(Boolean))]) {
            this.db.prepare('INSERT OR IGNORE INTO tags(name) VALUES (?)').run(name);
            this.db.prepare('INSERT OR IGNORE INTO item_tags(item_id,tag_id,origin) SELECT ?,id,? FROM tags WHERE name=?').run(id, origin, name);
        }
    }
    save(input: {
        url: string;
        note?: string;
        tags?: string[];
        source?: Item['source'];
    }) {
        return this.db.transaction(() => {
            const canonical = normalizeUrl(input.url);
            const existing = this.db.prepare('SELECT id FROM items WHERE canonical_url=? UNION SELECT item_id AS id FROM url_aliases WHERE url=?').get(canonical, canonical) as {
                id: string;
            } | undefined;
            if (existing)
                return { item: this.item(existing.id)!, duplicate: true };
            const id = ulid();
            this.db.prepare('INSERT INTO items(id,url,canonical_url,domain,note,source,created_at) VALUES (?,?,?,?,?,?,?)').run(id, input.url.trim(), canonical, new URL(canonical).hostname, input.note || null, input.source || 'web', new Date().toISOString());
            this.db.prepare('INSERT INTO url_aliases VALUES (?,?)').run(canonical, id);
            this.tag(id, input.tags || []);
            return { item: this.item(id)!, duplicate: false };
        })();
    }
    update(id: string, fields: Record<string, unknown>) {
        const allowed = new Set(['title', 'description', 'site_name', 'favicon_path', 'og_image_url', 'status', 'error', 'attempts', 'next_attempt_at', 'thumb_path', 'thumb_w', 'thumb_h', 'full_path', 'full_w', 'full_h', 'viewport_path', 'palette', 'tech', 'page_text', 'note', 'favourite', 'archived', 'captured_at', 'clipped', 'capture_repair', 'summary', 'tagging_status', 'tagging_error']);
        const entries = Object.entries(fields).filter(([key]) => allowed.has(key));
        if (entries.length)
            this.db.prepare(`UPDATE items SET ${entries.map(([key]) => `${key}=?`).join(',')} WHERE id=?`).run(...entries.map(([, value]) => value), id);
    }
    list(query: Record<string, string | undefined>): ItemPage {
        const where = ['archived=?'];
        const args: unknown[] = [query.archived === 'true' ? 1 : 0];
        if (query.favourite === 'true')
            where.push('favourite=1');
        if (query.domain) {
            where.push('domain=?');
            args.push(query.domain);
        }
        if (query.tag) {
            where.push('id IN (SELECT item_id FROM item_tags JOIN tags ON tags.id=tag_id WHERE name=?)');
            args.push(normalizeTag(query.tag));
        }
        if (query.q) {
            const term = searchQuery(query.q);
            if (term) {
                where.push('rowid IN (SELECT rowid FROM items_fts WHERE items_fts MATCH ?)');
                args.push(term);
            }
            else
                where.push('0');
        }
        const { total } = this.db.prepare(`SELECT count(*) AS total FROM items WHERE ${where.join(' AND ')}`).get(...args) as {
            total: number;
        };
        if (query.cursor) {
            let cursor: unknown;
            try {
                cursor = JSON.parse(Buffer.from(query.cursor, 'base64url').toString());
            }
            catch {
                throw new Error('Invalid cursor.');
            }
            if (!Array.isArray(cursor) || cursor.length !== 2 || !cursor.every(v => typeof v === 'string'))
                throw new Error('Invalid cursor.');
            where.push('(created_at < ? OR (created_at = ? AND id < ?))');
            args.push(cursor[0], cursor[0], cursor[1]);
        }
        const limit = Math.min(100, Math.max(1, Number(query.limit) || 40));
        const rows = this.db.prepare(`SELECT id FROM items WHERE ${where.join(' AND ')} ORDER BY created_at DESC,id DESC LIMIT ?`).all(...args, Math.floor(limit) + 1) as {
            id: string;
        }[];
        const more = rows.length > limit;
        const items = rows.slice(0, limit).map(row => this.item(row.id)!);
        const last = items.at(-1);
        return { items, total, next_cursor: more && last ? Buffer.from(JSON.stringify([last.created_at, last.id])).toString('base64url') : null };
    }
}
