# Product

<!-- impeccable:product-schema 1 -->

## Platform
web

## Stack
Node 22, TypeScript, Fastify, SQLite/better-sqlite3 with SQL migrations, Playwright/Chromium, sharp, Vite, React, plain CSS, Docker Compose. As specified in AGENTS.md.

## Users
A single person finding interesting things online and wanting to remember and revisit them.

## Product Purpose
Save a URL now, recognise it later, and remember why it mattered. Success means finding something saved a week ago using incomplete memories.

## Operating Context
Self-hosted on a Debian home server, accessible over LAN and Tailscale. Browser, bookmarklet, eventual Shortcut and Hermes are entry points into the same library.

## Capabilities and Constraints
URL-focused but broad: websites, articles, products, tools and references. Saving is durable before capture finishes. Optional notes and tags; no compulsory filing. No authentication, accounts, sharing, full HTML archiving or browser extension. Keep an API suitable for Hermes; its specific runtime/configuration remains unknown.

## Brand Commitments
Shelf is a placeholder name. MyMind is the reference for a quiet, image-led collection and effortless saving. Dark default with light theme available.

## Product Principles
- Save immediately; preview failure never loses a bookmark.
- Let recognition and retrieval guide the interface.
- Make organisation optional.
- Preserve successful captures until replacements succeed.

## Delivery
First milestone: capture and gallery, with bookmarklet and API intake brought forward. Phase 2 adds heuristic and optional model tagging, palettes, tech detection and text search. Richer covers, rediscovery and Raindrop follow later.
