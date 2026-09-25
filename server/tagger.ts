import { z } from 'zod';
import { normalizeTag } from './normalize.js';
export const categories = ['portfolio', 'agency', 'product', 'ecommerce', 'editorial', 'tool', 'experiment', 'article', 'reference', 'other'] as const;
const schema = z.object({
    tags: z.array(z.unknown()),
    category: z.enum(categories),
    summary: z.unknown(),
});
export type TaggerResult = {
    tags: string[];
    category: (typeof categories)[number];
    summary: string;
};
export type TaggerInput = {
    image: Buffer;
    mime: string;
    title: string | null;
    description: string | null;
    domain: string;
    pageText: string | null;
    existingTags: string[];
};
export interface Tagger {
    tag(input: TaggerInput): Promise<TaggerResult | null>;
}
export function parseModelResponse(text: string): TaggerResult | null {
    const stripped = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    const start = stripped.indexOf('{');
    const end = stripped.lastIndexOf('}');
    if (start < 0 || end <= start)
        return null;
    let parsed: unknown;
    try {
        parsed = JSON.parse(stripped.slice(start, end + 1));
    }
    catch {
        return null;
    }
    const result = schema.safeParse(parsed);
    if (!result.success)
        return null;
    const tags = [...new Set(result.data.tags.filter((tag): tag is string => typeof tag === 'string').map(normalizeTag).filter(Boolean))].slice(0, 8);
    const summary = String(result.data.summary).trim().slice(0, 500);
    if (tags.length < 3 || !summary)
        return null;
    return { tags, category: result.data.category, summary };
}
function prompt(input: TaggerInput) {
    const existing = input.existingTags.slice(0, 100).join(', ') || '(none yet)';
    return `You tag screenshots of saved web pages for a personal visual library.
Return strict JSON only, no markdown: {"tags":["kebab-case"],"category":"portfolio","summary":"one or two sentences"}
Rules:
- 3 to 8 tags, lowercase kebab-case
- Prefer existing tags when they fit: ${existing}
- Do not invent near-duplicates of existing tags (for example 3d vs three-d)
- category must be one of: ${categories.join(', ')}
- summary describes what the page is, not how it looks
Page:
domain: ${input.domain}
title: ${input.title || ''}
description: ${input.description || ''}
text: ${(input.pageText || '').slice(0, 2000)}`;
}
function endpoint(base: string, fallback: string, suffix: string) {
    const root = (base || fallback).replace(/\/$/, '');
    return root.endsWith(suffix) ? root : `${root}${suffix}`;
}
async function complete(url: string, headers: Record<string, string>, body: unknown) {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(45000) });
    if (!response.ok)
        throw new Error(`Tagger HTTP ${response.status}`);
    return response.json() as Promise<unknown>;
}
function textFromUnknown(value: unknown): string {
    if (typeof value === 'string')
        return value;
    if (Array.isArray(value))
        return value.map(part => {
            if (typeof part === 'string')
                return part;
            if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string')
                return part.text;
            return '';
        }).join('');
    return '';
}
export function createTaggerFromEnv(): Tagger | null {
    const provider = process.env.TAGGER_PROVIDER || 'none';
    const model = process.env.TAGGER_MODEL || '';
    const key = process.env.TAGGER_API_KEY || '';
    const base = process.env.TAGGER_BASE_URL || '';
    if (provider === 'none')
        return null;
    if (!model) {
        console.warn('TAGGER_MODEL is empty; heuristic tags only.');
        return null;
    }
    if (provider === 'openai-compatible') {
        const url = endpoint(base, 'https://api.openai.com/v1', '/chat/completions');
        return {
            async tag(input) {
                const data = await complete(url, key ? { Authorization: `Bearer ${key}` } : {}, {
                    model, max_tokens: 800, temperature: 0,
                    messages: [{ role: 'user', content: [
                        { type: 'text', text: prompt(input) },
                        { type: 'image_url', image_url: { url: `data:${input.mime};base64,${input.image.toString('base64')}` } },
                    ] }],
                });
                const choice = data && typeof data === 'object' && 'choices' in data ? (data as { choices?: { message?: { content?: unknown } }[] }).choices?.[0]?.message?.content : undefined;
                return parseModelResponse(textFromUnknown(choice));
            },
        };
    }
    if (provider === 'anthropic') {
        if (!key) {
            console.warn('TAGGER_API_KEY is empty; heuristic tags only.');
            return null;
        }
        const url = endpoint(base, 'https://api.anthropic.com', '/v1/messages');
        return {
            async tag(input) {
                const data = await complete(url, { 'x-api-key': key, 'anthropic-version': '2023-06-01' }, {
                    model, max_tokens: 800, temperature: 0,
                    messages: [{ role: 'user', content: [
                        { type: 'image', source: { type: 'base64', media_type: input.mime, data: input.image.toString('base64') } },
                        { type: 'text', text: prompt(input) },
                    ] }],
                });
                const blocks = data && typeof data === 'object' && 'content' in data ? (data as { content?: unknown }).content : undefined;
                return parseModelResponse(textFromUnknown(blocks));
            },
        };
    }
    console.warn(`Unknown TAGGER_PROVIDER ${provider}; heuristic tags only.`);
    return null;
}
