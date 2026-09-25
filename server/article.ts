import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { Page } from 'playwright';
import type { Article, ArticleNode } from '../shared/types.js';

const require = createRequire(import.meta.url);
const source = readFileSync(require.resolve('@mozilla/readability/Readability.js'), 'utf8');
const readerable = readFileSync(require.resolve('@mozilla/readability/Readability-readerable.js'), 'utf8');

// Parse an inert snapshot in a separate page: extraction cannot alter the capture.
export async function extractArticle(page: Page): Promise<Article | null> {
    const html = await page.content();
    if (html.length > 5_000_000) return null;
    const sandbox = await page.context().newPage();
    try {
        await sandbox.route('**/*', route => route.abort());
        return await sandbox.evaluate(({ html, url, source, readerable }) => {
            const doc = new DOMParser().parseFromString(html, 'text/html');
            doc.querySelectorAll('base').forEach(el => el.remove());
            const base = doc.createElement('base');
            base.href = url;
            doc.head.prepend(base);
            const library = new Function(`${source}\n${readerable}\nreturn { Readability, isProbablyReaderable };`)();
            if (!library.isProbablyReaderable(doc)) return null;
            const result = new library.Readability(doc, { maxElemsToParse: 50000, serializer: (el: Element) => el }).parse();
            if (!result) return null;
            const allowed = new Set(['p', 'div', 'section', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'strong', 'em', 'b', 'i', 'a', 'br', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'sup', 'sub', 'del']);
            const discard = new Set(['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'form', 'input', 'button', 'select', 'textarea', 'img', 'video', 'audio', 'noscript', 'template']);
            let count = 0;
            const clean = (node: Node, depth = 0): ArticleNode[] => {
                if (++count > 20000 || depth > 80) throw new Error('Article is too complex.');
                if (node.nodeType === Node.TEXT_NODE) return [node.textContent || ''];
                if (!(node instanceof Element)) return [];
                const tag = node.localName.toLowerCase();
                if (discard.has(tag)) return [];
                const children = [...node.childNodes].flatMap(child => clean(child, depth + 1));
                if (!allowed.has(tag)) return children;
                let href: string | undefined;
                if (tag === 'a') {
                    try {
                        const link = new URL(node.getAttribute('href') || '', url);
                        if (['http:', 'https:'].includes(link.protocol) && !link.username && !link.password) href = link.href;
                    } catch { /* Keep the label of an invalid link. */ }
                    if (!href) return children;
                }
                return [{ tag, children, ...(href ? { href } : {}) }];
            };
            const content = clean(result.content);
            const textOf = (node: ArticleNode): string => typeof node === 'string' ? node : node.children.map(textOf).join('') + (['p', 'div', 'section', 'li', 'blockquote', 'pre', 'br', 'tr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(node.tag) ? '\n\n' : '');
            const text = content.map(textOf).join('').replace(/\n[ \t]*\n(?:\s*\n)+/g, '\n\n').trim();
            if (text.length < 500 || text.length > 2_000_000) return null;
            return { title: result.title || '', byline: result.byline || null, content, text,
                minutes: Math.max(1, Math.ceil(text.split(/\s+/u).length / 220)), dir: result.dir === 'rtl' ? 'rtl' : 'ltr' } as Article;
        }, { html, url: page.url(), source, readerable });
    } finally {
        await sandbox.close();
    }
}
