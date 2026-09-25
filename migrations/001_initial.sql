CREATE TABLE items (
 id TEXT PRIMARY KEY, url TEXT NOT NULL, canonical_url TEXT NOT NULL UNIQUE, domain TEXT NOT NULL,
 title TEXT, description TEXT, site_name TEXT, favicon_path TEXT, og_image_url TEXT,
 status TEXT NOT NULL DEFAULT 'queued', error TEXT, attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt_at INTEGER NOT NULL DEFAULT 0,
 thumb_path TEXT, thumb_w INTEGER, thumb_h INTEGER, full_path TEXT, full_w INTEGER, full_h INTEGER,
 viewport_path TEXT, palette TEXT NOT NULL DEFAULT '[]', tech TEXT NOT NULL DEFAULT '[]', page_text TEXT,
 note TEXT, favourite INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0,
 source TEXT NOT NULL DEFAULT 'web', created_at TEXT NOT NULL, captured_at TEXT,
 clipped INTEGER NOT NULL DEFAULT 0, capture_repair INTEGER NOT NULL DEFAULT 0,
 summary TEXT, tagging_status TEXT NOT NULL DEFAULT 'pending', tagging_error TEXT,
 tag_text TEXT NOT NULL DEFAULT ''
);
CREATE INDEX items_queue ON items(status, next_attempt_at);
CREATE INDEX items_chronology ON items(created_at DESC, id DESC);
CREATE TABLE url_aliases (url TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE);
CREATE TABLE tags (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE);
CREATE TABLE item_tags (
 item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
 tag_id INTEGER NOT NULL REFERENCES tags(id), origin TEXT NOT NULL,
 PRIMARY KEY(item_id, tag_id, origin)
);
CREATE VIRTUAL TABLE items_fts USING fts5(title, description, domain, page_text, note, tag_text, content='items', content_rowid='rowid');
CREATE TRIGGER items_ai AFTER INSERT ON items BEGIN
 INSERT INTO items_fts(rowid,title,description,domain,page_text,note,tag_text) VALUES(new.rowid,new.title,new.description,new.domain,new.page_text,new.note,new.tag_text);
END;
CREATE TRIGGER items_ad AFTER DELETE ON items BEGIN
 INSERT INTO items_fts(items_fts,rowid,title,description,domain,page_text,note,tag_text) VALUES('delete',old.rowid,old.title,old.description,old.domain,old.page_text,old.note,old.tag_text);
END;
CREATE TRIGGER items_au AFTER UPDATE ON items BEGIN
 INSERT INTO items_fts(items_fts,rowid,title,description,domain,page_text,note,tag_text) VALUES('delete',old.rowid,old.title,old.description,old.domain,old.page_text,old.note,old.tag_text);
 INSERT INTO items_fts(rowid,title,description,domain,page_text,note,tag_text) VALUES(new.rowid,new.title,new.description,new.domain,new.page_text,new.note,new.tag_text);
END;
CREATE TRIGGER item_tags_ai AFTER INSERT ON item_tags BEGIN
 UPDATE items SET tag_text=(SELECT group_concat(name,' ') FROM tags WHERE id IN (SELECT tag_id FROM item_tags WHERE item_id=new.item_id)) WHERE id=new.item_id;
END;
CREATE TRIGGER item_tags_ad AFTER DELETE ON item_tags BEGIN
 UPDATE items SET tag_text=coalesce((SELECT group_concat(name,' ') FROM tags WHERE id IN (SELECT tag_id FROM item_tags WHERE item_id=old.item_id)),'') WHERE id=old.item_id;
END;
