import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Item, ItemPage } from '../shared/types.js';
import { masonry } from '../shared/masonry.js';
import './style.css';
async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
    if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Could not connect to Shelf. Try again.');
    }
    return response.status === 204 ? undefined as T : response.json();
}
async function copyText(value: string): Promise<boolean> {
    try {
        if (navigator.clipboard) {
            await navigator.clipboard.writeText(value);
            return true;
        }
    } catch { /* Try the compatible fallback for LAN HTTP and restricted browsers. */ }
    const before = document.activeElement as HTMLElement | null;
    const field = document.createElement('textarea');
    field.value = value;
    field.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.append(field);
    field.select();
    let copied = false;
    try { copied = document.execCommand('copy'); } catch { /* Show selectable text instead. */ }
    field.remove();
    before?.focus();
    return copied;
}
function Icon({ name, ...props }: {
    name: string;
} & React.SVGProps<SVGSVGElement>) {
    const shapes: Record<string, React.ReactNode> = {
        search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></>,
        plus: <path d="M12 5v14M5 12h14"/>, close: <path d="m6 6 12 12M18 6 6 18"/>,
        arrow: <path d="M5 12h14m-6-6 6 6-6 6"/>, external: <><path d="M14 4h6v6m0-6-10 10"/><path d="M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5"/></>,
        sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></>,
        heart: <path d="M20.5 5.5a5 5 0 0 0-8.5 2 5 5 0 0 0-8.5-2C-1 11 12 20 12 20s13-9 8.5-14.5Z"/>,
        filter: <><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2"/><circle cx="15" cy="17" r="2"/></>,
        settings: <><circle cx="12" cy="12" r="3"/><path d="m9 3-1 3-3 1-2 3 2 2-1 3 3 2 2-1 3 2 3-2 2 1 3-3-1-3 2-2-2-3-3-1-1-3Z"/></>,
        link: <><path d="m10 14 4-4m-6 6-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 10a4 4 0 0 0 6 0l4-4a4 4 0 0 0-6-6l-1 1" transform="translate(1 0) scale(.9)"/></>,
        back: <path d="M19 12H5m6-6-6 6 6 6"/>,
    };
    return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{shapes[name] || shapes.link}</svg>;
}
function useRoute() {
    const [route, setRoute] = useState(location.pathname);
    useEffect(() => { const pop = () => setRoute(location.pathname); addEventListener('popstate', pop); return () => removeEventListener('popstate', pop); }, []);
    const navigate = useCallback((to: string, replace = false) => { history[replace ? 'replaceState' : 'pushState']({}, '', to); setRoute(to); }, []);
    return [route, navigate] as const;
}
function App() {
    const [route, navigate] = useRoute();
    const detailId = route.startsWith('/item/') ? route.split('/')[2] : null;
    const [theme, setTheme] = useState(() => localStorage.getItem('shelf-theme') || 'dark');
    const [query, setQuery] = useState('');
    const [search, setSearch] = useState('');
    const [favourite, setFavourite] = useState(false);
    const [archived, setArchived] = useState(false);
    const [tag, setTag] = useState('');
    const [filters, setFilters] = useState(false);
    const [adding, setAdding] = useState(false);
    const [items, setItems] = useState<Item[]>([]);
    const itemsRef = useRef(items);
    itemsRef.current = items;
    const [total, setTotal] = useState(0);
    const [cursor, setCursor] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [tags, setTags] = useState<{
        name: string;
        count: number;
    }[]>([]);
    const [revision, setRevision] = useState(0);
    const requestId = useRef(0);
    const searchRef = useRef<HTMLInputElement>(null);
    useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('shelf-theme', theme); }, [theme]);
    useEffect(() => { const timer = setTimeout(() => setSearch(query), 250); return () => clearTimeout(timer); }, [query]);
    const params = useCallback(() => new URLSearchParams({ q: search, favourite: String(favourite), archived: String(archived), tag }), [search, favourite, archived, tag]);
    const refresh = useCallback(async (reset = false) => {
        const id = ++requestId.current;
        if (reset)
            setLoading(true);
        try {
            const desired = reset ? 40 : Math.max(40, itemsRef.current.length);
            let gathered: Item[] = [];
            let next: string | null = null;
            let count = 0;
            do {
                const p = params();
                p.set('limit', '100');
                if (next)
                    p.set('cursor', next);
                const page = await api<ItemPage>(`/api/items?${p}`);
                gathered.push(...page.items);
                next = page.next_cursor;
                count = page.total;
            } while (next && gathered.length < desired);
            if (id === requestId.current) {
                setItems(gathered);
                setCursor(next);
                setTotal(count);
                setError('');
            }
        }
        catch (e) {
            if (id === requestId.current)
                setError((e as Error).message);
        }
        finally {
            if (id === requestId.current)
                setLoading(false);
        }
    }, [params]);
    useEffect(() => { void refresh(true); }, [refresh]);
    useEffect(() => {
        const events = new EventSource('/api/events');
        let timer: ReturnType<typeof setTimeout>;
        const update = () => { clearTimeout(timer); timer = setTimeout(() => { void refresh(); setRevision(n => n + 1); void api<typeof tags>('/api/tags').then(setTags).catch(() => { }); }, 200); };
        events.addEventListener('change', update);
        events.addEventListener('connected', update);
        return () => { events.close(); clearTimeout(timer); };
    }, [refresh]);
    useEffect(() => { if (!notice)
        return; const timer = setTimeout(() => setNotice(''), 6000); return () => clearTimeout(timer); }, [notice]);
    useEffect(() => { const key = (e: KeyboardEvent) => { if (e.key === '/' && !/INPUT|TEXTAREA/.test((e.target as HTMLElement).tagName)) {
        e.preventDefault();
        searchRef.current?.focus();
    } }; addEventListener('keydown', key); return () => removeEventListener('keydown', key); }, []);
    const more = useCallback(async () => {
        if (!cursor || loadingMore)
            return;
        setLoadingMore(true);
        const id = requestId.current;
        try {
            const p = params();
            p.set('cursor', cursor);
            const result = await api<ItemPage>(`/api/items?${p}`);
            if (id === requestId.current) {
                setItems(old => [...old, ...result.items.filter(i => !old.some(o => o.id === i.id))]);
                setCursor(result.next_cursor);
            }
        }
        catch (e) {
            setError((e as Error).message);
        }
        finally {
            setLoadingMore(false);
        }
    }, [cursor, loadingMore, params]);
    const loadRef = useRef<HTMLDivElement>(null);
    useEffect(() => { if (!loadRef.current)
        return; const observer = new IntersectionObserver(entries => { if (entries[0].isIntersecting)
        void more(); }, { rootMargin: '500px' }); observer.observe(loadRef.current); return () => observer.disconnect(); }, [more]);
    const close = useCallback(() => navigate('/', true), [navigate]);
    const open = (id: string) => navigate(`/item/${id}`);
    const filtered = !!(search || favourite || archived || tag);
    return <>
    <div className="app-shell" inert={detailId ? true : undefined}>
      <header className="topbar">
        <a className="wordmark" href="/" onClick={e => { e.preventDefault(); navigate('/'); }}>shelf<span className="brand-dot"/></a>
        <nav aria-label="Main navigation"><a href="/" aria-current={route === '/' ? 'page' : undefined} onClick={e => { e.preventDefault(); navigate('/'); }}>Collection</a><a href="/settings" aria-current={route === '/settings' ? 'page' : undefined} onClick={e => { e.preventDefault(); navigate('/settings'); }}>Ways to save</a></nav>
        <button className="icon-button theme-button" title="Switch colour theme" aria-label="Switch colour theme" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}><Icon name="sun"/></button>
      </header>
      {route === '/settings' ? <Settings notify={setNotice}/> : <main>
        <div className="collection-heading"><div><h1>A place for your finds.</h1><p>Keep what catches your eye. Come back when it’s time.</p></div><button className="primary" onClick={() => setAdding(!adding)} aria-expanded={adding}><Icon name={adding ? 'close' : 'plus'}/>{adding ? 'Close' : 'Save a link'}</button></div>
        {adding && <SaveForm onSaved={item => { setNotice(item.duplicate ? 'Already on your shelf. Open it to recapture.' : 'Saved to your shelf. The preview is on its way.'); setAdding(false); void refresh(); }}/>}
        <div className="collection-tools"><label className="search"><Icon name="search"/><input ref={searchRef} value={query} onChange={e => setQuery(e.target.value)} placeholder="Find something you saved…" aria-label="Search your collection"/>{query ? <button className="icon-button" aria-label="Clear search" onClick={() => setQuery('')}><Icon name="close"/></button> : <kbd>/</kbd>}</label><button className={`secondary filter-button ${filters || filtered ? 'selected' : ''}`} onClick={() => setFilters(!filters)} aria-expanded={filters}><Icon name="filter"/>Filters{(favourite || archived || tag) && <span className="filter-dot"/>}</button></div>
        {filters && <div className="filters"><button className={favourite ? 'chip active' : 'chip'} aria-pressed={favourite} onClick={() => setFavourite(!favourite)}><Icon name="heart"/>Favourites</button><button className={archived ? 'chip active' : 'chip'} aria-pressed={archived} onClick={() => setArchived(!archived)}>Archived</button><label>Tag <select value={tag} onChange={e => setTag(e.target.value)}><option value="">All tags</option>{tags.map(t => <option key={t.name}>{t.name}</option>)}</select></label>{filtered && <button className="text-button" onClick={() => { setQuery(''); setTag(''); setFavourite(false); setArchived(false); }}>Clear filters</button>}</div>}
        <div className="collection-meta"><span>{archived ? 'Archived' : favourite ? 'Your favourites' : search ? 'Search results' : 'Your collection'} <span className="count">{total}</span></span><span>Newest first</span></div>
        {error && <div className="error" role="alert">{error} <button onClick={() => void refresh(true)}>Try again</button></div>}
        {loading ? <div className="empty"><p>Opening your shelf…</p></div> : items.length ? <Gallery items={items} open={open}/> : <div className="empty"><div className="empty-mark"><Icon name={filtered ? 'search' : 'link'} width="32" height="32"/></div><h2>{filtered ? 'Nothing here just yet.' : 'Good finds deserve a home.'}</h2><p>{filtered ? 'Try a different search or clear your filters.' : 'That useful tool. An article for later. A site you don’t want to lose. Save your first link here.'}</p><button className="primary" onClick={() => { if (filtered) {
            setQuery('');
            setFavourite(false);
            setArchived(false);
            setTag('');
        }
        else
            setAdding(true); }}>{filtered ? 'Clear filters' : 'Save your first link'}<Icon name="arrow"/></button>{!filtered && <a href="/settings" onClick={e => { e.preventDefault(); navigate('/settings'); }}>Or add the bookmarklet to your browser</a>}</div>}
        <div ref={loadRef} className="load-more">{cursor && <button className="secondary" disabled={loadingMore} onClick={() => void more()}>{loadingMore ? 'Loading…' : 'Load more'}</button>}</div>
        <footer><span>Your own little corner of the internet.</span><span>Shelf</span></footer>
      </main>}
    </div>
    {detailId && <Detail key={detailId} id={detailId} revision={revision} close={close} notify={setNotice} previous={() => { const i = items.findIndex(x => x.id === detailId); if (i > 0)
        navigate(`/item/${items[i - 1].id}`, true); }} next={() => { const i = items.findIndex(x => x.id === detailId); if (i >= 0 && i < items.length - 1)
        navigate(`/item/${items[i + 1].id}`, true); }}/>}
    {notice && <div className="toast" role="status">{notice}<button className="icon-button" aria-label="Dismiss notification" onClick={() => setNotice('')}><Icon name="close"/></button></div>}
  </>;
}
function SaveForm({ onSaved }: {
    onSaved: (item: Item & {
        duplicate: boolean;
    }) => void;
}) {
    const [url, setUrl] = useState('');
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    return <form className="save-form" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setError(''); try {
        onSaved(await api('/api/items', { method: 'POST', body: JSON.stringify({ url, note }) }));
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } }}>
    <div className="save-url"><label htmlFor="save-url">The link</label><input id="save-url" type="url" autoFocus required value={url} onChange={e => setUrl(e.target.value)} placeholder="https://something-worth-keeping.com"/></div>
    <div className="save-note"><label htmlFor="save-note">Why you’re saving it <span>(optional)</span></label><input id="save-note" value={note} onChange={e => setNote(e.target.value)} maxLength={10000} placeholder="A little reminder for future you"/></div><button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save link'}<Icon name="arrow"/></button>{error && <p className="error" role="alert">{error}</p>}
  </form>;
}
function Gallery({ items, open }: {
    items: Item[];
    open: (id: string) => void;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(1);
    useLayoutEffect(() => { if (!ref.current)
        return; const observer = new ResizeObserver(entries => setWidth(entries[0].contentRect.width)); observer.observe(ref.current); return () => observer.disconnect(); }, []);
    const layout = masonry(items.map(i => ({ width: i.thumb_w || 600, height: i.thumb_h || 375 })), width);
    return <div ref={ref} className="gallery" style={{ height: layout.height, visibility: width === 1 ? 'hidden' : 'visible' }}>{items.map((item, index) => <a className="bookmark" key={item.id} href={`/item/${item.id}`} style={{ ...layout.positions[index], position: 'absolute' }} onClick={e => { if (e.metaKey || e.ctrlKey)
            return; e.preventDefault(); open(item.id); }}>
    <div className="preview" style={{ aspectRatio: `${item.thumb_w || 600} / ${item.thumb_h || 375}` }}>{item.thumb_path ? <img src={item.thumb_path} width={item.thumb_w!} height={item.thumb_h!} loading="lazy" alt={`Preview of ${item.title || item.domain}`}/> :             <div className={`placeholder ${item.status === 'failed' ? 'failed' : ''}`}><Icon name="link" width="28" height="28"/><span>{item.domain}</span><small>{item.status === 'failed' ? 'Preview unavailable · open to paste a screenshot' : item.status === 'capturing' ? 'Making your preview…' : 'Saved · preview queued'}</small></div>}{item.favourite && <span className="favourite-indicator" aria-label="Favourite"><Icon name="heart"/></span>}{item.thumb_path && item.status === 'capturing' && <span className="capture-badge">Refreshing…</span>}</div>
    <div className="card-caption"><h2>{item.title || item.domain}</h2><p>{item.favicon_path && <img src={item.favicon_path} alt="" width="14" height="14"/>}{item.domain}<Icon name="external" width="12" height="12"/></p>{!!item.tags.length && <div className="card-tags">{item.tags.slice(0, 3).map(name => <span key={name}>{name}</span>)}</div>}</div>
  </a>)}</div>;
}
function Detail({ id, revision, close, notify, previous, next }: {
    id: string;
    revision: number;
    close: () => void;
    notify: (value: string) => void;
    previous: () => void;
    next: () => void;
}) {
    const [item, setItem] = useState<Item | null>(null);
    const [error, setError] = useState('');
    const [view, setView] = useState<'full' | 'viewport'>('full');
    const [note, setNote] = useState('');
    const noteLoaded = useRef(false);
    const draft = useRef(note);
    draft.current = note;
    const persistedNote = useRef('');
    const pendingNote = useRef<Promise<boolean> | null>(null);
    const saveNote = useCallback(async (): Promise<boolean> => {
        if (!noteLoaded.current) return true;
        if (pendingNote.current && !await pendingNote.current) return false;
        const value = draft.current;
        if (value === persistedNote.current) return true;
        setSaved('Saving…');
        const request = api<Item>(`/api/items/${id}`, { method: 'PATCH', body: JSON.stringify({ note: value }) })
            .then(result => {
                persistedNote.current = value;
                setItem(result);
                setSaved(draft.current === value ? 'Saved' : 'Unsaved');
                if (draft.current === value) sessionStorage.removeItem(`shelf-note-${id}`);
                return true;
            }).catch((error: Error) => {
                setError(error.message);
                setSaved('Could not save — try again');
                return false;
            }).finally(() => { pendingNote.current = null; });
        pendingNote.current = request;
        return request;
    }, [id]);
    const leave = useCallback(async (destination: () => void) => {
        if (await saveNote()) destination();
    }, [saveNote]);
    const [tag, setTag] = useState('');
    const [busy, setBusy] = useState(false);
    const [saved, setSaved] = useState('');
    const panel = useRef<HTMLDivElement>(null);
    const closeRef = useRef<HTMLButtonElement>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [dropping, setDropping] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);
    const pasteHint = /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘V' : 'Ctrl+V';
    const submitCover = useCallback(async (file: Blob) => {
        if (!file.type.startsWith('image/')) {
            setError('Paste or choose a PNG, JPEG or WebP screenshot.');
            return;
        }
        setBusy(true);
        setError('');
        try {
            const response = await fetch(`/api/items/${id}/cover`, { method: 'POST', headers: { 'Content-Type': file.type || 'image/png' }, body: file });
            const body = await response.json().catch(() => ({}));
            if (!response.ok)
                throw new Error(body.error || 'Could not save that screenshot.');
            setItem(body);
            notify('Screenshot saved.');
        }
        catch (e) {
            setError((e as Error).message);
        }
        finally {
            setBusy(false);
        }
    }, [id, notify]);
    useEffect(() => {
        const onPaste = (e: ClipboardEvent) => {
            if (/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement)?.tagName || ''))
                return;
            const file = [...(e.clipboardData?.files || [])].find(f => f.type.startsWith('image/')) || [...(e.clipboardData?.items || [])].map(item => item.getAsFile()).find(f => f?.type.startsWith('image/'));
            if (!file)
                return;
            e.preventDefault();
            void submitCover(file);
        };
        addEventListener('paste', onPaste);
        return () => removeEventListener('paste', onPaste);
    }, [submitCover]);
    useEffect(() => { let active = true; api<Item>(`/api/items/${id}`).then(data => { if (active) {
        setItem(data);
        if (!noteLoaded.current) {
            persistedNote.current = data.note || '';
            const restored = sessionStorage.getItem(`shelf-note-${id}`);
            setNote(restored ?? persistedNote.current);
            if (restored !== null && restored !== persistedNote.current) setSaved('Unsaved draft restored');
            noteLoaded.current = true;
        }
    } }).catch(e => { if (active)
        setError(e.message); }); return () => { active = false; }; }, [id, revision]);
    useEffect(() => { const before = document.activeElement as HTMLElement; const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; closeRef.current?.focus(); return () => { document.body.style.overflow = overflow; before?.focus(); }; }, []);
    useEffect(() => {
        const key = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                void leave(close);
                return;
            }
            if (!/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName)) {
                if (e.key === 'ArrowLeft')
                    void leave(previous);
                if (e.key === 'ArrowRight')
                    void leave(next);
            }
            if (e.key === 'Tab') {
                const nodes = [...panel.current!.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input,textarea,select')];
                const first = nodes[0], last = nodes.at(-1);
                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last?.focus();
                }
                else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first?.focus();
                }
            }
        };
        addEventListener('keydown', key);
        return () => removeEventListener('keydown', key);
    }, [close, next, previous, leave]);
    const update = async (body: Record<string, unknown>) => { setError(''); setBusy(true); try {
        const result = await api<Item>(`/api/items/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
        setItem(result);
        return true;
    }
    catch (e) {
        setError((e as Error).message);
        return false;
    }
    finally {
        setBusy(false);
    } };
    const action = async (kind: 'recapture' | 'delete') => { setBusy(true); setError(''); try {
        if (kind === 'delete') {
            await api(`/api/items/${id}`, { method: 'DELETE' });
            notify('Bookmark deleted.');
            close();
        }
        else {
            setItem(await api(`/api/items/${id}/recapture`, { method: 'POST' }));
            notify('A new preview is on its way.');
        }
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } };
    return <div className="detail" role="dialog" aria-modal="true" aria-labelledby="detail-title" ref={panel}>
    <div className="detail-toolbar"><button ref={closeRef} className="secondary" onClick={() => void leave(close)}><Icon name="back"/>Collection</button><div className="segmented" aria-label="Screenshot view"><button aria-pressed={view === 'full'} onClick={() => setView('full')}>Full page</button><button aria-pressed={view === 'viewport'} onClick={() => setView('viewport')}>First screen</button></div><button className="icon-button" onClick={() => void leave(close)} aria-label="Close detail"><Icon name="close"/></button></div>
    {item ? <div className="detail-body"><div className="screenshot-panel" onDragOver={e => { e.preventDefault(); if (item.status !== 'capturing') setDropping(true); }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropping(false); }} onDrop={e => { e.preventDefault(); setDropping(false); const file = [...e.dataTransfer.files].find(f => f.type.startsWith('image/')); if (file && item.status !== 'capturing') void submitCover(file); }}>{(view === 'full' ? item.full_path : item.viewport_path) ? <img className="full-shot" src={(view === 'full' ? item.full_path : item.viewport_path)!} alt={`Captured ${view === 'full' ? 'page' : 'first screen'} of ${item.title || item.domain}`}/> : <div className={`cover-drop ${dropping ? 'over' : ''}`}><Icon name="link" width="32" height="32"/><h2>{item.status === 'failed' ? 'The link is safe. The preview couldn’t load.' : item.status === 'capturing' || item.status === 'queued' ? 'Saved. Making your preview…' : 'Add a screenshot'}</h2>{item.status !== 'capturing' && item.status !== 'queued' ? <><p>Paste a screenshot with {pasteHint}, drop an image, or choose a file.</p><button type="button" className="secondary" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? 'Saving…' : 'Choose image'}</button></> : <p>You can open the original page at any time.</p>}<a href={item.url} target="_blank" rel="noreferrer">Visit {item.domain}<Icon name="external"/></a></div>}{dropping && (view === 'full' ? item.full_path : item.viewport_path) && <div className="cover-overlay">Drop to replace this screenshot</div>}{item.clipped && view === 'full' && <p className="clip-notice">Screenshot clipped at {item.full_h?.toLocaleString()}px.</p>}<input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void submitCover(file); }}/></div>
    <aside className="detail-sidebar"><div className="domain-line">{item.favicon_path && <img src={item.favicon_path} alt="" width="20" height="20"/>}{item.domain}</div><h1 id="detail-title">{item.title || item.domain}</h1><a className="visit-link" href={item.url} target="_blank" rel="noreferrer">Visit original<Icon name="external" width="16" height="16"/></a>{item.description && <p className="description">{item.description}</p>}{item.summary && <p className="summary">{item.summary}</p>}<p className="saved-date">Saved {new Date(item.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}{item.source === 'hermes' ? ' via Hermes' : ''}</p>
    {item.error && <div className="error"><p>{item.thumb_path ? 'The last refresh failed. Your previous preview is still here.' : 'Your link is saved, but capture needs another try. Paste a screenshot with ' + pasteHint + ', or retry.'}</p><details><summary>Capture details</summary><p>{item.error}</p></details></div>}
    <section className="note-section"><label htmlFor="item-note">Why you saved it</label><textarea id="item-note" placeholder="Leave a little reminder for future you…" value={note} maxLength={10000} onChange={e => { setNote(e.target.value); draft.current = e.target.value; sessionStorage.setItem(`shelf-note-${id}`, e.target.value); setSaved('Unsaved'); }} onBlur={() => void saveNote()}/><div className="note-status" role="status">{saved}{saved.startsWith('Could not') && <button onClick={() => void saveNote()}>Retry</button>}</div></section>
    <section><h2>Tags</h2><div className="tags">{item.tags.map(name => <button className="chip" key={name} disabled={busy} title={`Remove ${name}`} onClick={() => void update({ remove_tags: [name] })}>{name}<Icon name="close" width="12" height="12"/></button>)}</div><form className="tag-form" onSubmit={async (e) => { e.preventDefault(); if (tag.trim() && await update({ add_tags: [tag] }))
            setTag(''); }}><input aria-label="Add a tag" placeholder="Add a tag…" maxLength={100} value={tag} onChange={e => setTag(e.target.value)}/><button className="icon-button" disabled={!tag.trim() || busy} aria-label="Add tag"><Icon name="plus"/></button></form></section>
    {!!item.palette.length && <section><h2>Colours</h2><div className="palette">{item.palette.map(hex => <button key={hex} style={{ background: hex }} title={`Copy ${hex}`} aria-label={`Copy colour ${hex}`} onClick={() => copyText(hex).then(copied => notify(copied ? `${hex} copied` : `Select and copy this colour: ${hex}`))}/>)}</div></section>}
    {!!item.tech.length && <section><h2>Detected</h2><div className="tags">{item.tech.map(name => <span className="chip" key={name}>{name}</span>)}</div></section>}
    <div className="detail-actions"><button className="secondary" disabled={busy} aria-pressed={item.favourite} onClick={() => void update({ favourite: !item.favourite })}><Icon name="heart"/>{item.favourite ? 'Favourited' : 'Favourite'}</button><button className="secondary" disabled={busy || item.status === 'capturing' || item.status === 'queued'} onClick={() => void action('recapture')}>{item.status === 'capturing' || item.status === 'queued' ? 'Preview in progress…' : item.status === 'failed' ? 'Retry preview' : 'Recapture'}</button><button type="button" className="secondary" disabled={busy || item.status === 'capturing'} title={`Paste with ${pasteHint}, drop an image, or choose a file`} onClick={() => fileRef.current?.click()}>{busy ? 'Saving…' : item.thumb_path ? 'Replace screenshot' : 'Add screenshot'}</button><button className="text-button" disabled={busy} onClick={() => void update({ archived: !item.archived })}>{item.archived ? 'Unarchive' : 'Archive'}</button><button className="text-button danger" disabled={busy || item.status === 'capturing'} onClick={() => setConfirmDelete(true)}>Delete</button></div>
    {confirmDelete && <div className="delete-confirm"><p>Delete this bookmark and its screenshots?</p><button className="secondary" onClick={() => setConfirmDelete(false)}>Keep it</button><button className="secondary danger" disabled={busy} onClick={() => void action('delete')}>Delete bookmark</button></div>}{error && <p className="error" role="alert">{error}</p>}
    </aside></div> : <div className="empty"><h1 id="detail-title">{error ? 'Couldn’t open this bookmark.' : 'Opening your bookmark…'}</h1>{error && <p role="alert">{error}</p>}</div>}
  </div>;
}
function Settings({ notify }: {
    notify: (text: string) => void;
}) {
    const link = useRef<HTMLAnchorElement>(null);
    const bookmarklet = `javascript:window.open(${JSON.stringify(location.origin + '/add?url=')}+encodeURIComponent(location.href),'shelf','width=420,height=260');void(0)`;
    useEffect(() => { link.current?.setAttribute('href', bookmarklet); }, [bookmarklet]);
    const command = `curl -X POST '${location.origin}/api/items' \\\n  -H 'Content-Type: application/json' \\\n  -d '{"url":"https://example.com","note":"Why this caught my eye","source":"hermes"}'`;
    return <main className="settings"><h1>Find it. Keep it.</h1><p className="settings-intro">A few easy ways to put something on your shelf.</p><section><span className="settings-symbol"><Icon name="link"/></span><div><h2>One click from your browser</h2><p>Drag this button to your bookmarks bar. When you find something worth keeping, click it to save the page.</p><a ref={link} className="primary bookmarklet" onClick={e => { e.preventDefault(); notify('Drag this button to your bookmarks bar, then use it on a page you want to save.'); }}>Save to Shelf<Icon name="plus"/></a><p className="hint">Your Shelf server needs to be reachable from this browser.</p></div></section><section><span className="settings-symbol"><Icon name="arrow"/></span><div><h2>Send a link with Hermes</h2><p>Give Hermes your Shelf address and ask it to send URLs to the save endpoint. Notes and tags are optional. A repeat URL returns the bookmark you already saved.</p><pre><code>{command}</code></pre><button className="secondary" onClick={() => copyText(command).then(copied => notify(copied ? 'API example copied.' : 'Select and copy the example above.'))}>Copy example</button><p className="hint">Hermes must be on your LAN or connected through Tailscale. This endpoint is ready; connecting your Hermes instance is a separate step.</p></div></section><section><span className="settings-symbol"><Icon name="plus"/></span><div><h2>From your phone</h2><p>Create an Apple Shortcut that receives URLs from the share sheet and sends a JSON request to <code>{location.origin}/api/items</code> with the shared URL in a <code>url</code> field.</p><p>Turn on Tailscale when you’re away from home. The README includes the full Shortcut recipe.</p></div></section></main>;
}
createRoot(document.getElementById('root')!).render(<App />);
