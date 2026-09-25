import { randomBytes } from 'node:crypto';
const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export function ulid() {
    let time = BigInt(Date.now());
    let head = '';
    for (let i = 0; i < 10; i++) {
        head = alphabet[Number(time % 32n)] + head;
        time /= 32n;
    }
    return head + [...randomBytes(16)].map(byte => alphabet[byte & 31]).join('');
}
export function normalizeUrl(input: string) {
    const url = new URL(input.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
        throw new Error('Use an http or https URL without credentials.');
    if (url.href.length > 8000)
        throw new Error('That URL is too long.');
    url.hash = '';
    for (const key of [...url.searchParams.keys()])
        if (/^utm_/i.test(key) || ['fbclid', 'gclid', 'msclkid'].includes(key))
            url.searchParams.delete(key);
    return url.href;
}
export function normalizeTag(value: string) {
    return value.normalize('NFKC').toLowerCase().trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 64);
}
export function searchQuery(value: string) {
    return value.match(/[\p{L}\p{N}_]+/gu)?.slice(0, 20).map(word => `"${word}"*`).join(' AND ') || '';
}
