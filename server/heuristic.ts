import { platforms } from './capture-rules.js';
import { normalizeTag } from './normalize.js';
export function platformTag(domain: string) {
    const host = domain.replace(/^www\./, '').toLowerCase();
    return platforms.find(([suffix]) => host === suffix || host.endsWith(`.${suffix}`))?.[1];
}
function rgb(hex: string): [number, number, number] | undefined {
    const match = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!match)
        return;
    const n = Number.parseInt(match[1], 16);
    return [n >> 16 & 255, n >> 8 & 255, n & 255];
}
function luminance([r, g, b]: [number, number, number]) {
    const channel = (value: number) => {
        const s = value / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
function chroma([r, g, b]: [number, number, number]) {
    return (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
}
export function moodFromPalette(palette: string[]) {
    const colours = palette.map(rgb).filter((value): value is [number, number, number] => !!value);
    if (!colours.length)
        return;
    const sat = colours.reduce((sum, colour) => sum + chroma(colour), 0) / colours.length;
    const lum = colours.reduce((sum, colour) => sum + luminance(colour), 0) / colours.length;
    if (sat < 0.12)
        return 'monochrome';
    if (lum < 0.28)
        return 'dark';
    if (lum > 0.72)
        return 'light';
    return 'colourful';
}
export function heuristicTags(input: {
    domain: string;
    tech: string[];
    palette: string[];
}) {
    const tags = [...input.tech];
    const platform = platformTag(input.domain);
    if (platform)
        tags.push(platform);
    const mood = moodFromPalette(input.palette);
    if (mood)
        tags.push(mood);
    return [...new Set(tags.map(normalizeTag).filter(Boolean))];
}
