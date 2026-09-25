# Shelf: self-hosted visual bookmarks

Build a small self-hosted app that takes a URL, screenshots the page, stores metadata and auto-generated tags, and shows everything in a masonry gallery. Clicking a card opens the full screenshot with site details in a sidebar.

It runs in Docker on a Debian home server. Access is over the LAN and Tailscale only, so there is no auth, no user accounts and no multi-tenancy. Keep it single-user and simple.

"Shelf" is a placeholder name. Use it for the repo, container and UI title until told otherwise.

## Stack

- Node 22, TypeScript throughout.
- Server: Hono (or Fastify) serving a JSON API and the built frontend from one process.
- Capture: Playwright with Chromium.
- Images: sharp for thumbnails and dominant colour extraction.
- Database: SQLite via better-sqlite3, with FTS5 for search. Use Drizzle or plain SQL with a migrations folder, no ORM magic.
- Frontend: Vite + React. No UI framework; plain CSS with custom properties.
- Deploy: a single `docker-compose.yml`, based on the official `mcr.microsoft.com/playwright` image so Chromium and its system deps are already present.

## Data model

`items`
- `id` (ulid), `url`, `canonical_url`, `domain`
- `title`, `description`, `site_name`, `favicon_path`, `og_image_url`
- `status`: `queued | capturing | tagging | done | failed`
- `error` (text, nullable), `attempts` (int)
- `thumb_path`, `thumb_w`, `thumb_h`
- `full_path`, `full_w`, `full_h`
- `viewport_path` (1440x900 above-the-fold shot)
- `palette` (JSON array of 5 hex colours)
- `tech` (JSON array, e.g. `["gsap","three.js","webflow"]`)
- `page_text` (first ~5,000 chars of visible text, for search and tagging)
- `note` (user note, nullable)
- `favourite` (bool), `archived` (bool)
- `source`: `web | bookmarklet | shortcut | raindrop`
- `created_at`, `captured_at`

`tags` (`id`, `name` unique, lowercase kebab-case)

`item_tags` (`item_id`, `tag_id`, `origin`: `auto | manual`)

FTS5 virtual table over `title`, `description`, `domain`, `page_text`, `note`, and a denormalised tag string. Keep it in sync with triggers.

Dedupe on `canonical_url`. Submitting a URL that already exists returns the existing item and offers a "recapture" action instead of making a duplicate.

## Storage layout

All files live under a mounted volume `/data`:

```
/data/shelf.db
/data/shots/<id>/full.webp
/data/shots/<id>/viewport.webp
/data/shots/<id>/thumb.webp
/data/shots/<id>/favicon.png
```

Serve `/data/shots` as static files with long cache headers. Screenshot files are immutable per capture; a recapture writes a new id-suffixed filename so caches never go stale.

## API

- `POST /api/items` body `{ url, note?, tags? }`. Validates the URL, creates a `queued` item, returns it immediately (201, or 200 with the existing item if it's a duplicate).
- `GET /api/items?q=&tag=&domain=&favourite=&cursor=&limit=` returns paginated items, newest first. `q` runs an FTS query.
- `GET /api/items/:id`
- `PATCH /api/items/:id` for note, favourite, archived, and manual tag add/remove.
- `POST /api/items/:id/recapture`
- `DELETE /api/items/:id` removes the row and its files.
- `GET /api/tags` returns tags with counts.
- `GET /api/events` is a Server-Sent Events stream that pushes item status changes so the gallery updates live while captures run.
- `GET /add?url=...` is a tiny HTML page for the bookmarklet: it posts the URL, shows "Saved", and closes itself after a second.

## Capture pipeline

Run a job worker in the same process, polling the `items` table for `queued` rows. Concurrency of 2 by default (env `CAPTURE_CONCURRENCY`). Keep one Chromium browser alive and open a fresh context per job.

For each job:

1. Open a context at 1440x900, device scale factor 1, a normal desktop Chrome user agent, `reducedMotion: 'no-preference'`.
2. Block known cookie-consent and chat widget scripts at the network level (keep a small editable blocklist file: OneTrust, Cookiebot, Intercom, Drift, HubSpot chat, etc.). After load, also inject CSS that hides common consent selectors, and try clicking an "Accept" button if one is visible.
3. `goto` with `waitUntil: 'load'`, 30s timeout, then wait for network idle with a 5s cap. Don't fail the job on a network-idle timeout.
4. Take the viewport screenshot before scrolling.
5. Scroll to the bottom in steps (viewport height x 0.8, ~250ms pause each) so lazy-loaded images and scroll-triggered animations (GSAP ScrollTrigger, IntersectionObserver reveals) fire. Cap at 25,000px of scroll. Then scroll back to the top and wait 1s.
6. Before the full-page shot, inject CSS that resets `position: fixed/sticky` headers after the first one if they'd repeat through the stitched image, and force `opacity: 1` / `transform: none` on elements still hidden by reveal animations. Put this behind a flag and store which mode was used, since it can break some layouts.
7. Take a full-page screenshot, clipped to a max height of 16,000px. Record whether it was clipped.
8. Extract metadata in-page: title, meta description, `og:*`, canonical link, theme-color, favicon URL, and `document.body.innerText` trimmed to ~5,000 chars.
9. Detect tech by checking globals and script srcs: `window.gsap`, `window.THREE`, `window.__NEXT_DATA__`, `window.Webflow`, Framer, Shopify, WordPress (`/wp-content/`), Astro (`astro-island`), Lenis, Barba, Swiper, Spline, Rive, Lottie, and whether a WebGL canvas exists. Keep the detector list in one data file so it's easy to extend.
10. Close the context.

Post-processing with sharp:

- `full.webp` at quality 80.
- `viewport.webp` at quality 82.
- `thumb.webp`: resize the viewport shot to 600px wide. Use the viewport shot for the thumbnail, since a thumbnail of a 16,000px page is an unreadable sliver. Store its width and height for masonry layout.
- Palette: 5 dominant colours from the viewport shot.

Failures: retry up to 2 times with backoff. On final failure, mark `failed`, keep the error, and still show the card in the gallery with a placeholder and a retry button. Sites behind Cloudflare challenges will fail sometimes; that's acceptable.

## Auto-tagging

Two layers, merged and deduped.

Heuristic tagger (always runs, no network):
- Domain-derived tags for known platforms (`awwwards`, `github`, `dribbble`, `codepen`, etc.).
- Tech tags from step 9 (`gsap`, `webgl`, `three-js`, `webflow`, `shopify`, `framer`).
- A colour-mood tag from the palette: `dark`, `light`, `monochrome`, `colourful`.

Model tagger (optional, enabled when `TAGGER_PROVIDER` is set):
- Send the viewport screenshot plus title, description, domain and the first ~2,000 chars of page text to a vision-capable model.
- Ask for strict JSON: `{ "tags": string[], "category": string, "summary": string }`. 3 to 8 tags, lowercase kebab-case. Category from a fixed list: `portfolio`, `agency`, `product`, `ecommerce`, `editorial`, `tool`, `experiment`, `article`, `reference`, `other`.
- Pass the current top 100 existing tags in the prompt and tell the model to prefer them, so the vocabulary stays tight instead of growing `3d`, `three-d`, `3d-graphics` side by side.
- Store `summary` on the item and show it in the sidebar.
- Implement a provider interface with two adapters: an OpenAI-compatible chat endpoint (covers OpenAI, and local runtimes like Ollama or LM Studio via `TAGGER_BASE_URL`) and Anthropic's Messages API. Model name, base URL and key all come from env. Don't hardcode model names.
- Parse defensively: strip code fences, validate with zod, fall back to heuristic tags only if parsing fails.

Tagging never blocks the capture from showing up. The item appears in the gallery as soon as the thumbnail exists; tags arrive afterwards via SSE.

## Frontend

Gallery (`/`):
- Top bar: URL input with a "Save" button (paste and hit Enter), a search box, a tag filter, and toggles for favourites and archived.
- Masonry grid using JS placement: compute column count from container width (target ~300px columns, 16px gap), then place each card in the shortest column using the stored `thumb_w`/`thumb_h`, so nothing jumps while images load. Keep newest-first order reading left to right across the top. CSS `columns` orders top-to-bottom per column, which breaks chronology, so don't use it.
- Card: thumbnail, title, domain with favicon, up to 3 tags. Queued/capturing cards show a pulsing placeholder with the URL.
- Infinite scroll with cursor pagination.
- Lazy-load thumbs with `loading="lazy"` and explicit width/height.
- Dark UI by default, with a light theme toggle. Let the screenshots carry the colour.

Detail view (opens on card click, URL becomes `/item/:id` so it's linkable and the back button closes it):
- Left: the full-page screenshot in a scrollable panel at fit-to-width. A toggle switches between full page and viewport shot. Show a "clipped at 16,000px" notice when relevant.
- Right sidebar, ~360px: title, clickable URL (opens in a new tab), domain, saved date, model summary, palette swatches (click to copy hex), detected tech, tags (removable, with an input to add), note (editable textarea, autosaves on blur), and actions: favourite, recapture, archive, delete.
- Keyboard: Esc closes, left/right arrows move to the previous/next item in the current filtered list.
- On narrow screens the sidebar stacks below the image.

## Getting URLs in

- Web UI input box (above).
- Bookmarklet: `javascript:window.open('http://<host>/add?url='+encodeURIComponent(location.href),'shelf','width=320,height=160')`. Show the exact bookmarklet on a `/settings` page with the host filled in from the request, so it can be dragged straight to the bookmarks bar.
- iOS/macOS Shortcut: document in the README how to build a share-sheet Shortcut that POSTs `{ url }` to `/api/items`. Works from the phone when Tailscale is on.
- Raindrop import (phase 3): accept a Raindrop CSV export upload on `/settings`, and optionally a Raindrop API test token in env for a periodic sync of a chosen collection. Imported items go into the same queue, rate-limited to one capture every 10s so a 500-bookmark backfill doesn't hammer the server. Carry Raindrop tags across as manual tags.

## Deployment

- `docker-compose.yml` with one service, `restart: unless-stopped`, port `3080:3000`, volume `./data:/data`, `shm_size: 1gb` (Chromium crashes with the default /dev/shm), and an `.env` file.
- Healthcheck hitting `/api/health`, which reports DB status, browser status and queue length.
- No auth. Bind to all interfaces and rely on the server not being exposed to the internet. Mention in the README that `tailscale serve` can front it with HTTPS on the tailnet if the Shortcut needs HTTPS.
- Env vars: `CAPTURE_CONCURRENCY`, `MAX_FULLPAGE_HEIGHT`, `TAGGER_PROVIDER` (`openai-compatible | anthropic | none`), `TAGGER_BASE_URL`, `TAGGER_API_KEY`, `TAGGER_MODEL`, `RAINDROP_TOKEN`, `RAINDROP_COLLECTION_ID`, `RAINDROP_SYNC_MINUTES`.
- Provide `.env.example` with every variable and a comment on each.

## Build phases

Do these in order. Each phase ends with the app running via `docker compose up` and the acceptance checks passing.

Phase 1, capture and gallery
- Project scaffold, DB schema and migrations, capture worker, POST/GET API, static file serving, masonry gallery, detail view with sidebar (title, URL, date, screenshot).
- Accept when: pasting 5 varied URLs (a static blog, a GSAP-heavy portfolio, a Shopify store, a long docs page, a site with a cookie banner) produces 5 cards with sensible thumbnails, and clicking each shows the full page.

Phase 2, tagging and search
- Heuristic tagger, tech detection, palette, model tagger with both adapters, FTS search, tag filter, SSE live updates, manual tag editing, notes, favourites.
- Accept when: tags appear on new items within a minute without a page reload, search finds items by words from their page text, and switching `TAGGER_PROVIDER=none` still produces heuristic tags.

Phase 3, intake and polish
- Bookmarklet page, `/settings`, Shortcut docs, Raindrop CSV import and API sync, recapture, archive, delete, keyboard navigation, failed-item retry UI.
- Accept when: a Raindrop CSV with 50 rows imports without duplicates and drains the queue at the configured rate.

## Out of scope

- Auth, users, sharing, public links.
- Archiving full HTML or making pages browsable offline.
- Browser extension (the bookmarklet covers it).
- Video capture of animations.

## Notes for the implementer

- Write a `README.md` covering setup, env vars, the bookmarklet and the Shortcut.
- Add a small test suite for URL normalisation/dedupe, tag normalisation, the masonry placement function and the model-response parser. Playwright capture can be covered by one smoke test against a local fixture page.
- Log each capture with duration and outcome. Keep logs to stdout so `docker logs` and lazydocker show them.
- Ask before adding any dependency outside the stack listed above.
