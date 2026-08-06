# ( grief, healing, and opening to love ) — design spec

A personal digital zine/archive. Homepage is an archive grid of issue covers; each issue ("volume") is built as a two-page-spread magazine — scroll-snapped vertically through spreads, fixed page aspect ratio, swipeable one-page-at-a-time on mobile. This doc is the reference for rebuilding it as a real site (Astro or otherwise).

## Signature device
Lowercase text in parentheses — `( vol 01 — one more time )` — used everywhere: nav, labels, dates, captions, the "next" link. It's the site's only recurring ornament; nothing else gets a border or badge treatment.

## Typography
Two families only:
- **Newsreader** (serif) — headlines, quotes, body copy, italic for a softer register. Weights used: 200 (display/quotes), 300 (default/body), 400 (regular).
- **IBM Plex Mono** — labels, dates, page numbers, timestamps, captions. Weights 300–600. Does triple duty via case/tracking/color: tight tracked-out uppercase eyebrows (`letter-spacing:0.3em; text-transform:uppercase`), lowercase parenthetical labels (no tracking), tiny page folios (`11px`).

Type scale (keep tight — this is the biggest lever for "editorial" feel):
- Eyebrow/section label: 11px mono, 0.3em tracking, uppercase
- Folio (page number): 11px mono, 0.2em tracking — always `position:absolute`, pinned to a fixed page corner, never in flow (must survive any copy length)
- Caption/small aside: 13–14px, italic serif or mono depending on context
- Body copy: 14–16px serif, line-height 1.6–1.8
- Display quote: 20–34px serif italic 200-weight, line-height ~1.25 (scale down on tighter/two-page layouts vs single-page moments)
- Cover/hero title: clamp(38px, 6.5vw, 72px), serif italic 200-weight

Avoid introducing sizes outside this scale — variety comes from color/spacing/photo treatment, not from adding more type sizes.

## Color
Warm, muted, low-saturation. No pure black/white.
- Paper/cream ground: `#eee7d8`, secondary tan `#e2dac8`, mid tan `#c9c0a8`
- Near-black ink: `#1c1a14` / `#221f19`
- Warm grays (secondary text): `#6d6a58`, `#8a8776`, `#4a4738`
- Near-black/espresso (dark spreads): `#171310`, `#181008`, `#0d0b08`
- Rust/accent: `#a8412a` (primary accent), `#7d2f1c` (deep rust bg), `#e2874a` / `#c98a4a` (warm amber highlight)
- Deep moss (floral spread only): `#3a4630`

Max two background modes per spread: paper (cream/tan) or dark (espresso/rust/moss). Never both on the same page.

## Layout system — the page/spread mechanic
```
.snap-wrap  { scroll-snap-type: y mandatory; height:100vh; overflow-y:auto; }
.snap-sec   { scroll-snap-align:center; min-height:100vh; display:flex; align-items:center; justify-content:center; }
.spread-row { display:flex; align-items:stretch; gap:3px; }   /* the "two pages" — no spine/shadow illusion */
.pg         { aspect-ratio:3/4; height:min(84vh,860px); }      /* fixed page size, content crops to fit */
```
- One `.snap-sec` per spread (or single page for the cover). Scrolling vertically snaps spread-to-spread.
- Each `.pg` is a fixed 3:4 box — design each page to fit that box; never let copy or images overflow it (folios are the thing most likely to get pushed off — always `position:absolute`).
- Mobile (`max-width:899px`): `.spread-row` becomes a horizontal scroll-snap container so the two pages of a spread become swipeable single screens.
- A full-bleed image can "bleed across the gutter" (span both pages of a spread) by absolutely positioning it behind both `.pg` boxes at `width: calc(page-width * 2 + gap)` — used sparingly, for high-impact moments only (one photo, one message).

## Recurring page devices (mix across an issue — never repeat the same device twice in a row)
1. **Organic photo cutouts** — `clip-path: polygon(...)`, hard graphic edges (no soft/blurred masks). The shape must reference actual photo content: a lamp becomes a circle, a skyline becomes a stepped "building" polygon, incense smoke becomes a winding ribbon. Crop via `background-image` + `background-size`/`background-position` on the clipped div (not `<img>` + mask) so you can zoom into the right region of the source photo.
2. **Vellum/paper panel** — a translucent cream rectangle (`background: rgba(238,231,216,0.88–0.9)`, no border needed) laid over a dark full-bleed photo, holding quote text. Give it a slight rotation (±1°) and a soft shadow so it reads as a separate physical sheet, not a UI card.
3. **Soft glass/glow panel** — for quote pages that should feel like "reading through fogged glass": `backdrop-filter: blur(20px)`, background is a soft radial gradient (warm amber + dark), no hard edges/border, sits over a heavily blurred version of a photo.
4. **Duotone bold spread** — one full-bleed photo, `filter: grayscale(1)` + a solid accent color layered with `mix-blend-mode: multiply`, a huge low-opacity "ghost" folio number, tight mono eyebrow, bold serif italic quote with 1–2 words highlighted in the amber accent (`em.hl { color:#c98a4a }`).
5. **Tinted day-log tiles** — small square photos, each with a subtle color-multiply tint + bottom gradient scrim, a tiny roman numeral (top-left), a timestamp (top-right), one italic mood-word (bottom) — never a full sentence.
6. **Doodle + timestamp row** — a single thin hand-drawn-feeling ink line (SVG path, irregular curves, not a perfect polyline) over one photo per issue at most, paired with a plain mono timestamp row underneath. Restraint matters — one page per issue, not a running motif.
7. **Separated/"variety" page** — poem and photo intentionally NOT overlaid; generous whitespace between them; an optional one-line bilingual (Vietnamese) aside sits directly under the poem, not as a rule applied everywhere.
8. **Breathing/interstitial** — a full-bleed grainy, blurred image with no text (or one quiet caption line only). Used once or twice per issue as a pause, never as the whole identity.

## Bilingual device
One quiet Vietnamese line under an English poem/quote — occasional, never full parallel translation, never on every page. Toggled via a `bilingual` flag in the current build; keep as a per-page opt-in in the CMS, not a global switch.

## Content structure (for an Astro rebuild)
- `src/content/issues/vol-01.md` (or similar) — frontmatter: `title`, `date`, `location`, `pageCount`, `coverImage`; body or a `pages` array describes each spread's layout variant + content.
- Component breakdown:
  - `<ArchiveGrid>` — homepage, lists issues newest-first
  - `<IssueSpread>` — the `.snap-wrap` shell + scroll-snap mechanics, mobile swipe fallback
  - `<Page>` — the fixed `.pg` box; accepts a `variant` prop (`photo` | `text` | `quote-vellum` | `quote-glass` | `duotone` | `tile-grid` | `blank-bleed`)
  - `<PhotoCutout>` — takes an image + a named/custom clip-path
  - `<Folio>` — absolutely-positioned page number, always rendered last so it can't be pushed off
  - Minor asides (`vol 01a` mini fold-out) stay a distinct component/format — deliberately not spreads, for contrast.

## Screen map — vol 01 ("one more time"), 21 pages
| pages | content |
|---|---|
| 01 | cover — lamp-glow cutout + hand-drawn smoke lines + flower linework |
| 02–03 | the shrine — full-bleed photo / vellum-panel text |
| 04–05 | the undertone — Maya Angelou quote / separated photo + reflection |
| 06–07 | the bear — glass-panel quote over show poster / two scenes (dinner-table photo + forks-episode strip) |
| 08–09 | the day, logged — 4-tile day-log grid / workstation photo (editorial inset) |
| 10–11 | some nights — glass/glow quote over blurred incense / sharp incense photo, separated |
| 12–13 | specimens from one day — skyline cutout + doodle / stacked photos + caption |
| 14–15 | one more, not last — duotone dinner photo (Sue Zhao quote on facing page, not behind it) |
| 16–17 | floral breathing spread — full bleed, one quiet caption line |
| 18–19 | on repeat — playlist, split across both pages |
| 20–21 | closing — sunset photo with "so: one more time" + Vietnamese aside / next-volume link |

## What NOT to do
- No stitching/sticker/craft-kit decoration — mood comes from blur, glow, warmth, and paper translucency only.
- No soft/feathered cutout edges — always crisp `clip-path` polygons.
- No more than two background tones (paper or dark) per spread.
- No page number in normal flow — always absolutely positioned.
