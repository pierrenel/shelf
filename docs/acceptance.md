# First milestone verification

Verified on 25 September 2026.

## Build and runtime

- TypeScript check, server compilation and Vite production build pass.
- Core tests pass: URL validation/normalisation, duplicate saves, tag normalisation, FTS updates after note/tag changes, pagination, API validation, recapture preservation, deletion and masonry placement.
- Docker image builds with Node 22 and Playwright 1.63.0. Compose runs the single service on port 3080, with SQLite and screenshots on the data volume.
- Dependency audit after updating sharp reports zero known vulnerabilities.

## Isolated browser smoke test

Five synthetic local pages cover a static blog, scrolling reveal portfolio, storefront, 19,000px-class documentation page and consent overlay. All produced cards and full-page screenshots. Pixel dimensions were checked with sharp; the long fixture is clipped to 16,000px.

Browser checks cover live updates, search using extracted text, note saving, favourites, theme switching, desktop/mobile layouts, bookmarklet duplicate intake and immutable recapture. The browser reported no uncaught page errors. All test bookmarks are stored in disposable databases.

Review regressions also pass:

- Escape saves a dirty note before leaving.
- A failed note PATCH keeps the detail open and retains the draft; retry succeeds.
- Missing clipboard APIs produce selectable-copy guidance instead of silently doing nothing.

The independent UI review's final disposition is **ship at the reviewed scope**: both reported functional issues are resolved, with no visual regression in the reviewed detail and settings surfaces.

## Public-page capture check

All five public URLs completed capture and opened in the detail view:

| URL | Screenshot height | Observations |
| --- | ---: | --- |
| https://simonwillison.net/ | 15003px | Static blog, readable full capture |
| https://gsap.com/ | 9770px | GSAP detected; animated marketing page |
| https://www.allbirds.com/ | 3662px | Shopify detected; shipping-country popup remains visible |
| https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide | 6067px | Documentation, page text and metadata extracted |
| https://www.bbc.com/ | 12676px | News homepage captured; substantial advertising whitespace remains |

These are observations of one run, not guarantees about future page behaviour. Site-specific non-consent popups, login walls, bot challenges and aggressive scroll effects remain capture limitations. The GSAP production site exercises animation handling; the scroll-triggered portfolio behaviour is covered by the deterministic local fixture.

Review screenshots and machine-readable results are in the ignored `.impeccable/review/` directory. Public-page test captures were deleted with their temporary database; only review screenshots remain. No fixtures or public test URLs were inserted into the running personal collection.

## Next milestones

Richer covers, rediscovery, and Raindrop import/sync remain unimplemented. Hermes has a documented HTTP intake contract; the user's Hermes instance has not been configured or tested end to end.
