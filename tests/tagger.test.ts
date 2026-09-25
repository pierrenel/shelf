import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moodFromPalette, platformTag, heuristicTags } from '../server/heuristic.js';
import { parseModelResponse } from '../server/tagger.js';
test('colour-mood tags cover dark, light, monochrome and colourful palettes', () => {
    assert.equal(moodFromPalette(['#111111', '#1a1a1a', '#222222', '#2b2b2b', '#000000']), 'monochrome');
    assert.equal(moodFromPalette(['#000080', '#001a66', '#003399', '#000066', '#0a1a4a']), 'dark');
    assert.equal(moodFromPalette(['#c8e4ff', '#ffe4f0', '#e4ffd8', '#fff3c0', '#f0e0ff']), 'light');
    assert.equal(moodFromPalette(['#ff3b30', '#34c759', '#007aff', '#ffcc00', '#af52de']), 'colourful');
    assert.equal(moodFromPalette([]), undefined);
});
test('platform tags match known hosts including www and subdomains', () => {
    assert.equal(platformTag('github.com'), 'github');
    assert.equal(platformTag('www.dribbble.com'), 'dribbble');
    assert.equal(platformTag('foo.webflow.io'), 'webflow');
    assert.equal(platformTag('example.com'), undefined);
});
test('heuristic tags merge tech, platform and mood without duplicates', () => {
    const tags = heuristicTags({ domain: 'www.github.com', tech: ['gsap', 'webgl'], palette: ['#111111', '#222222', '#000000'] });
    assert.deepEqual(tags, ['gsap', 'webgl', 'github', 'monochrome']);
});
test('model-response parser strips fences, normalises tags and rejects bad payloads', () => {
    const ok = parseModelResponse(`Sure.
\`\`\`json
{"tags":["Three.js","WebGL","Portfolio Site"],"category":"portfolio","summary":"A motion-led studio site."}
\`\`\``);
    assert.deepEqual(ok, { tags: ['three-js', 'webgl', 'portfolio-site'], category: 'portfolio', summary: 'A motion-led studio site.' });
    assert.equal(parseModelResponse('not json'), null);
    assert.equal(parseModelResponse('{"tags":["one"],"category":"portfolio","summary":"Too few tags."}'), null);
    assert.equal(parseModelResponse('{"tags":["a","b","c"],"category":"mystery","summary":"Unknown category."}'), null);
    assert.equal(parseModelResponse('{"tags":["a","b","c"],"category":"tool","summary":""}'), null);
    const extra = parseModelResponse('{"tags":["alpha","beta","gamma","delta","epsilon","zeta","eta","theta","iota"],"category":"tool","summary":"A compact utility."}');
    assert.equal(extra?.tags.length, 8);
    assert.equal(extra?.category, 'tool');
});
