-- Existing YouTube bookmarks get the same automatic tag as new saves.
INSERT OR IGNORE INTO tags(name)
SELECT 'youtube' FROM items WHERE domain IN ('youtube.com','youtu.be','youtube-nocookie.com')
 OR domain LIKE '%.youtube.com' OR domain LIKE '%.youtu.be' OR domain LIKE '%.youtube-nocookie.com' LIMIT 1;
INSERT OR IGNORE INTO item_tags(item_id,tag_id,origin)
SELECT items.id,tags.id,'auto' FROM items JOIN tags ON tags.name='youtube'
WHERE domain IN ('youtube.com','youtu.be','youtube-nocookie.com')
 OR domain LIKE '%.youtube.com' OR domain LIKE '%.youtu.be' OR domain LIKE '%.youtube-nocookie.com';
