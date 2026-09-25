import React, { useState } from 'react';
import type { YouTubeVideo } from '../shared/youtube.js';

export function Video({ video, title, url }: { video: YouTubeVideo; title: string; url: string }) {
    const [playing, setPlaying] = useState(false);
    const source = `https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&playsinline=1${video.start ? `&start=${video.start}` : ''}`;
    return <div className="video-panel"><div className="video-frame">{playing ? <iframe src={source} title={`YouTube player: ${title}`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen/> : <div className="video-placeholder"><svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="3" y="9" width="42" height="30" rx="7"/><path d="m20 17 12 7-12 7Z"/></svg><h2>{title}</h2><button className="primary" onClick={() => setPlaying(true)}>Play video</button><p>Loads the YouTube player when you press play.</p></div>}</div><p className="video-help">Requires an internet connection. If playback is unavailable here, <a href={url} target="_blank" rel="noopener noreferrer">watch on YouTube</a>.</p></div>;
}
