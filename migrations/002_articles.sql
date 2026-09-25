ALTER TABLE items ADD COLUMN article_json TEXT;
ALTER TABLE items ADD COLUMN reading_minutes INTEGER;
ALTER TABLE items ADD COLUMN reading_progress REAL NOT NULL DEFAULT 0;
ALTER TABLE items ADD COLUMN is_read INTEGER NOT NULL DEFAULT 0;

-- Scrolling updates progress frequently; only reindex when searchable content changes.
DROP TRIGGER items_au;
CREATE TRIGGER items_au AFTER UPDATE OF title,description,domain,page_text,note,tag_text ON items BEGIN
 INSERT INTO items_fts(items_fts,rowid,title,description,domain,page_text,note,tag_text) VALUES('delete',old.rowid,old.title,old.description,old.domain,old.page_text,old.note,old.tag_text);
 INSERT INTO items_fts(rowid,title,description,domain,page_text,note,tag_text) VALUES(new.rowid,new.title,new.description,new.domain,new.page_text,new.note,new.tag_text);
END;
