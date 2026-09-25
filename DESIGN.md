---
name: Shelf
description: A quiet, image-led personal library of saved links.
colors:
  bg: "#20221f"
  panel: "#282b26"
  field: "#2e312c"
  text: "#efefe8"
  muted: "#afb4a8"
  line: "#41463c"
  accent: "#c5d8a4"
  on-accent: "#222c19"
  danger: "#f1aaa0"
  focus: "#d8e6c2"
  light-bg: "#f5f4ee"
  light-panel: "#eeeee5"
  light-field: "#e7e9df"
  light-text: "#292e24"
  light-muted: "#626957"
  light-line: "#d4d7c9"
  light-accent: "#354c29"
  light-on-accent: "#f3f6e9"
  light-danger: "#943d31"
  light-focus: "#526e3b"
typography:
  headline:
    fontFamily: 'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "36px"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "-.035em"
  title:
    fontSize: "25px"
    fontWeight: 500
    lineHeight: 1.3
  card-title:
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.4
  body:
    fontFamily: 'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "14px"
    lineHeight: 1.8
  label:
    fontSize: "13px"
    fontWeight: 500
  caption:
    fontSize: "12px"
  code:
    fontFamily: "ui-monospace, monospace"
    fontSize: "12px"
rounded:
  field: "6px"
  button: "8px"
  search: "9px"
  toast: "10px"
  preview: "12px"
  chip: "20px"
  circle: "50%"
spacing:
  compact: "8px"
  control-gap: "10px"
  field: "12px"
  form-gap: "16px"
  gallery-gap: "20px"
  panel: "24px"
  section: "28px"
  inset: "32px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.button}"
    padding: "11px 18px"
  button-secondary:
    backgroundColor: "{colors.field}"
    textColor: "{colors.text}"
    rounded: "{rounded.button}"
    padding: "11px 18px"
  button-secondary-hover:
    backgroundColor: "{colors.line}"
  input:
    backgroundColor: "{colors.field}"
    textColor: "{colors.text}"
    rounded: "{rounded.field}"
    padding: "12px"
  chip:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.chip}"
    padding: "7px 11px"
  chip-active:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
  preview:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.preview}"
---

# Design System: Shelf

## Overview

Shelf is a quiet, image-led personal library, following the user's MyMind reference. Olive charcoal and warm light surfaces support captured pages; restrained system typography keeps controls familiar. The light theme changes semantic colours while retaining the same components and geometry.

Key characteristics: unframed image cards, gentle corners, pale sage actions, compact metadata and generous space around the collection.

This is a scan of the implemented `web/style.css`, `web/main.tsx` and `shared/masonry.ts`. Rendered evidence is in `.impeccable/review/`, including desktop, mobile, detail, settings and light-theme captures. Preview rasters are runtime user content or explicitly labelled test fixtures; there is no bundled decorative imagery.

## Colors

### Primary

Sage `accent` marks primary actions, selected chips, links in detail, palette-related feedback and the wordmark dot. `on-accent` supplies its contrasting foreground. In light mode the accent becomes a deep olive; use the semantic variables rather than hardcoding the dark theme.

### Neutral

`bg` is the page canvas; `panel` separates screenshot surroundings, search and inline saving; `field` supports controls. `text` carries titles and active navigation, `muted` secondary metadata, and `line` borders and dividers. `focus` provides visible keyboard outlines. `danger` identifies errors and destructive actions. The frontmatter's `light-` counterparts map to those same CSS variables under `data-theme=light`.

## Typography

The system font stack is intentional. Headings use modest weight and tight tracking; card titles stay compact and truncate to one line. Collection headings reduce to 30px on phones. Detail titles use the title role, increasing to 27px on phones. Settings section titles are 21px. Body copy in settings is 14px; detail descriptions are 13px, both with spacious line height. Dates, domains and helper text use smaller muted type. Monospace is reserved for API examples.

## Layout

The application shell is centred with an 1800px maximum width. Horizontal padding is 56px, increasing to 72px above 1600px, reducing to 30px at 1000px and 20px at 650px. The navigation bar is 104px tall, or 80px on phones.

Gallery placement uses the shortest column, calculated from a 280px target width and a 20px gap. Each image reserves its stored aspect ratio and adds 100px for its caption (title, domain and up to three tags). The first row reads left to right; phones use one column. Do not replace this with CSS columns.

Detail occupies the viewport: an 80px toolbar, flexible screenshot region and 360px sidebar (320px below 1000px). Below 650px the toolbar is 70px and the sidebar stacks below a screenshot region capped at 58vh. The screenshot and desktop sidebar scroll independently. Settings has an 820px maximum content width. Save fields wrap at 1000px and stack with a full-width action at 650px.

## Elevation & Depth

Depth comes from tonal surfaces and thin dividers. Cards have no border or shadow; their captured image supplies the visual weight. The fixed feedback toast is the exception, using `0 10px 35px #0003`. Detail is an opaque full-screen surface, not a floating translucent sheet.

## Shapes

Preview images and inline save panels share the preview radius. Buttons are gently rounded rectangles; fields use a slightly tighter radius. Tags are pills. Icon buttons, palette swatches and the small wordmark dot are circular. Icons are simple inline SVG strokes, normally 20px with a 1.6px stroke and rounded caps and joins.

## Components

- **Buttons:** primary sage and secondary tonal variants share a 44px minimum height. Primary hover increases brightness; secondary hover uses the divider tone. Text actions stay unfilled. Icon buttons are normally 40px circles. Disabled buttons dim to 55% and show a wait cursor.
- **Fields and search:** ordinary inputs have thin borders; the search field is a wider panel with an inset icon and keyboard hint. Search uses a focus-within outline. Notes have a tonal textarea and a persistent status line beneath it.
- **Navigation:** two text links sit beside the lowercase wordmark. Active links use main text, inactive links muted text. Theme switching is a trailing icon button.
- **Chips:** outlined muted pills represent tags and filters. Selected filter chips use accent fill. Removable tags carry a small close icon.
- **Cards:** previews clip to rounded corners; title and favicon/domain caption sit directly on the canvas. Image hover brightens over 200ms. The external-link indicator appears on hover and keyboard focus. Queued placeholders use a softly breathing link icon; failed captures show explicit retry guidance.
- **Detail controls:** a tonal segmented control switches full-page and first-screen views. Colour swatches are circular copy controls and grow slightly on hover. Notes, tags and actions use the same field and button vocabulary as the collection.
- **Feedback:** inline errors use the danger tone; dismissible toast messages use accent fill. Save panels and detail enter with a 220ms opacity/6px vertical transition. Reduced-motion preference disables transitions and animation.

All interactive elements receive a 2px focus outline with a 4px offset; search uses a 2px offset around its container.

## Do's and Don'ts

- **Do** preserve the quiet, image-led identity and both semantic themes.
- **Do** use captured content as the visual material and reserve its dimensions before loading.
- **Do** keep keyboard focus, inline errors and save status visible.
- **Don't** turn collection cards into elevated bordered panels.
- **Don't** introduce a display font to replace the intentional system stack.
- **Don't** treat colours inside saved screenshots or synthetic fixtures as application palette tokens.
