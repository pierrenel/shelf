export const blockedHosts = ['cookielaw.org', 'onetrust.com', 'cookiebot.com', 'intercom.io', 'intercomcdn.com', 'drift.com', 'driftt.com', 'hs-scripts.com', 'hubspotmessages.com'];
export const consentSelectors = '#onetrust-banner-sdk, #CybotCookiebotDialog, .cc-window, #cookie-law-info-bar, [id="cookie-banner"], [class="cookie-banner"], #intercom-container';
export const platforms: [string, string][] = [
    ['github.com', 'github'], ['dribbble.com', 'dribbble'], ['codepen.io', 'codepen'], ['awwwards.com', 'awwwards'],
    ['behance.net', 'behance'], ['figma.com', 'figma'], ['notion.so', 'notion'], ['notion.site', 'notion'],
    ['medium.com', 'medium'], ['substack.com', 'substack'], ['producthunt.com', 'producthunt'], ['cargo.site', 'cargo'],
    ['framer.website', 'framer'], ['framer.app', 'framer'], ['webflow.io', 'webflow'], ['myshopify.com', 'shopify'],
    ['shopify.com', 'shopify'], ['read.cv', 'read-cv'], ['are.na', 'are-na'], ['layers.to', 'layers'],
    ['godly.website', 'godly'], ['siteinspire.com', 'siteinspire'], ['cosmos.so', 'cosmos'], ['pinterest.com', 'pinterest'],
    ['squarespace.com', 'squarespace'], ['tumblr.com', 'tumblr'],
];
export const detectors = [
    { name: 'gsap', global: 'gsap', pattern: 'gsap' },
    { name: 'three-js', global: 'THREE', pattern: 'three.min.js' },
    { name: 'next-js', global: '__NEXT_DATA__', pattern: '/_next/' },
    { name: 'webflow', global: 'Webflow', pattern: 'webflow' },
    { name: 'framer', global: '', pattern: 'framerusercontent.com' },
    { name: 'shopify', global: 'Shopify', pattern: 'cdn.shopify.com' },
    { name: 'wordpress', global: '', pattern: '/wp-content/' },
    { name: 'astro', global: '', pattern: '/_astro/' },
    { name: 'lenis', global: 'Lenis', pattern: 'lenis' },
    { name: 'barba', global: 'barba', pattern: 'barba' },
    { name: 'swiper', global: 'Swiper', pattern: 'swiper' },
    { name: 'spline', global: '', pattern: 'spline' },
    { name: 'rive', global: 'rive', pattern: 'rive' },
    { name: 'lottie', global: 'lottie', pattern: 'lottie' },
];
