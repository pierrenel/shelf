export interface YouTubeVideo { id: string; start: number }

export function youtubeVideo(value: string): YouTubeVideo | null {
    try {
        const url = new URL(value);
        if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
        const host = url.hostname.toLowerCase();
        const parts = url.pathname.split('/').filter(Boolean);
        let id: string | null = null;
        if (host === 'youtu.be' && parts.length === 1) id = parts[0];
        else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com'].includes(host)) {
            if (url.pathname === '/watch') id = url.searchParams.get('v');
            else if (['shorts', 'embed', 'live'].includes(parts[0]) && parts.length === 2) id = parts[1];
        }
        if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
        const raw = url.searchParams.get('t') || url.searchParams.get('start') || new URLSearchParams(url.hash.slice(1)).get('t') || '';
        const time = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(raw);
        const seconds = /^\d+$/.test(raw) ? Number(raw) : time ? Number(time[1] || 0) * 3600 + Number(time[2] || 0) * 60 + Number(time[3] || 0) : 0;
        return { id, start: Math.min(604800, seconds) };
    } catch { return null; }
}
