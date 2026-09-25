import React, { useEffect, useRef, useState } from 'react';
import type { ArticleNode, Item } from '../shared/types.js';

// Never insert captured HTML into Shelf's DOM. Only these elements can render.
const tags = new Set(['p', 'div', 'section', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'strong', 'em', 'b', 'i', 'a', 'br', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'sup', 'sub', 'del']);
function renderNode(node: ArticleNode, key: number): React.ReactNode {
    if (typeof node === 'string') return node;
    const children = node.children.map(renderNode);
    if (!tags.has(node.tag)) return <React.Fragment key={key}>{children}</React.Fragment>;
    if (node.tag === 'a') {
        if (!node.href || !/^https?:\/\//i.test(node.href)) return <React.Fragment key={key}>{children}</React.Fragment>;
        return <a key={key} href={node.href} target="_blank" rel="noopener noreferrer">{children}</a>;
    }
    return React.createElement(node.tag, { key }, ...children);
}
export function Reader({ item }: { item: Item }) {
    const container = useRef<HTMLDivElement>(null);
    const [saveError, setSaveError] = useState(false);
    const retry = useRef<() => void>(() => {});
    useEffect(() => {
        const el = container.current!;
        const key = `shelf-reading-${item.id}`;
        let progress = item.reading_progress;
        try {
            const local = localStorage.getItem(key);
            if (local !== null && Number.isFinite(Number(local))) progress = Math.min(1, Math.max(0, Number(local)));
        } catch { /* Server progress remains available without local storage. */ }
        el.scrollTop = progress * Math.max(0, el.scrollHeight - el.clientHeight);
        let timer: ReturnType<typeof setTimeout>;
        let saved = item.reading_progress;
        let active = true;
        let pending: Promise<void> | null = null;
        const persist = async () => {
            if (pending) { await pending; }
            if (saved === progress) return;
            const value = progress;
            pending = fetch(`/api/items/${item.id}`, { method: 'PATCH', keepalive: true,
                headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reading_progress: value }) })
                .then(response => {
                    if (!response.ok) throw new Error('Could not save position');
                    saved = value;
                    if (active) setSaveError(false);
                }).catch(() => { if (active) setSaveError(true); }).finally(() => { pending = null; });
            await pending;
        };
        retry.current = () => { void persist(); };
        const scroll = () => {
            const range = el.scrollHeight - el.clientHeight;
            if (range <= 0) return;
            progress = Math.min(1, Math.max(0, el.scrollTop / range));
            try { localStorage.setItem(key, String(progress)); } catch { /* Still save to Shelf. */ }
            clearTimeout(timer);
            timer = setTimeout(() => { void persist(); }, 800);
        };
        const flush = () => { clearTimeout(timer); void persist(); };
        el.addEventListener('scroll', scroll, { passive: true });
        window.addEventListener('pagehide', flush);
        return () => {
            active = false;
            el.removeEventListener('scroll', scroll);
            window.removeEventListener('pagehide', flush);
            flush();
        };
    }, [item.id]);
    const article = item.article!;
    return <div className="reader-panel" ref={container} tabIndex={0} aria-label="Saved article">
        <article className="reader" dir={article.dir}>
            <header className="reader-header"><p className="reader-meta">{item.domain} · {article.minutes} min read</p><h2>{article.title || item.title}</h2>{article.byline && <p className="reader-byline">{article.byline}</p>}</header>
            <div className="reader-content">{article.content.map(renderNode)}</div>
            <p className="reader-end">Saved on your shelf. <a href={item.url} target="_blank" rel="noreferrer">Visit original</a></p>
            {saveError && <p className="error" role="status">Position saved in this browser, but couldn’t sync to Shelf. <button onClick={() => retry.current()}>Retry</button></p>}
        </article>
    </div>;
}
