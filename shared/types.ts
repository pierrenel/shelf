export interface Item {
    id: string;
    url: string;
    canonical_url: string;
    domain: string;
    title: string | null;
    description: string | null;
    site_name: string | null;
    favicon_path: string | null;
    og_image_url: string | null;
    status: 'queued' | 'capturing' | 'done' | 'failed';
    error: string | null;
    attempts: number;
    thumb_path: string | null;
    thumb_w: number | null;
    thumb_h: number | null;
    full_path: string | null;
    full_w: number | null;
    full_h: number | null;
    viewport_path: string | null;
    page_text: string | null;
    note: string | null;
    favourite: boolean;
    archived: boolean;
    source: 'web' | 'bookmarklet' | 'shortcut' | 'hermes' | 'raindrop';
    created_at: string;
    captured_at: string | null;
    clipped: boolean;
    capture_repair: boolean;
    palette: string[];
    tech: string[];
    tags: string[];
    summary: string | null;
    tagging_status: string;
    tagging_error: string | null;
}
export interface ItemPage {
    items: Item[];
    next_cursor: string | null;
    total: number;
}
