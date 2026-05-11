# DeepMark Design System — v2.0

Internal reference · Design + Engineering  
Geoff Waugh (design) · Stu Bourhill (engineering)  
Updated: May 2026 · Supersedes v1.1

---

## What changed in v2.0

v1.1 was built on Geist, hard SE-offset shadows, a dot-grid background, and teal `#01ADD0` as the primary accent. v2.0 reflects the new dashboard direction agreed in May 2026.

| Token | v1.1 | v2.0 |
|---|---|---|
| Primary font | Geist | Inter |
| Mono font | Geist Mono | Inter (tabular nums where needed) |
| Editorial font | Lora | Georgia (system serif) |
| Primary accent | `#01ADD0` teal | `#3A96C3` blue |
| Active / dark accent | — | `#2878A8` |
| Background | Dot grid `22px` | Ruled lines `28px` |
| Card shadow | Hard SE `3px 3px 0px` | Soft diffuse two-layer |
| Max border radius | 10px | 14px (hero card only), 13px cards, 10px buttons |
| Pill radius | Forbidden | Forbidden (unchanged) |

The script reader interior retains the serious, focused character of v1.1. The new visual language applies to the dashboard shell, navigation, cards, and AI bar.

---

## 00 · Principles

DeepMark is a professional tool for teachers — not a consumer app. Every visual decision should read as intentional.

**Hierarchy through space, not colour.** Cards float above the ruled background via shadow. Colour is punctuation only — accent blue appears on primary CTAs, active states, and progress indicators. Everything else is neutral.

**Status is quiet.** Status (Marking / Review / Done) is communicated through a small tinted pill at the bottom of each card. Never through full-border colour, never through dot indicators.

**The AI bar is a centrepiece, not a utility.** On the dashboard it lives inside the hero card. It sets the tone — the product is intelligent, not just functional.

**The marking workflow is sacred.** All personality lives in the shell. Once a teacher enters the script reader, the UI is strictly serious and focused. No decorative elements.

---

## 01 · Colour

### Primary palette

| Name | Hex | Use |
|---|---|---|
| Accent | `#3A96C3` | Primary CTA, AI bar send button, "View all" links, progress bars (marking) |
| Active | `#2878A8` | Active sidebar state, avatar background, pulse number highlight |
| Ink | `#0C0C0C` | All headings and body text. Near-black, not pure black. |
| Success | `#1E8A5E` | Review status tag text |
| Success bg | `rgba(30,138,94,0.09)` | Review status tag background |
| Warning | `#C4883A` | Flag button border, warning states |
| Error | `#C04444` | Destructive actions, AO error highlights |

### Neutral scale

| Token | Value | Use |
|---|---|---|
| `--text-primary` | `#0C0C0C` | Body, headings |
| `--text-secondary` | `rgba(0,0,0,0.44)` | Secondary button labels |
| `--text-muted` | `rgba(0,0,0,0.28–0.33)` | Script counts, supporting labels |
| `--text-ghost` | `rgba(0,0,0,0.20–0.22)` | Section eyebrows, date stamps |
| `--border` | `rgba(0,0,0,0.065)` | Card borders |
| `--border-light` | `rgba(0,0,0,0.05–0.07)` | Dividers, rule lines within cards |
| `--surface` | `white` | Cards, hero card, sidebar |
| `--shell` | `#EFF0F0` | Page background |
| `--input-bg` | `#F7F8F8` | AI bar background |

### Status colours

| Status | Tag bg | Tag text | Progress bar |
|---|---|---|---|
| Marking | `rgba(58,150,195,0.10)` | `#1E618A` | `rgba(58,150,195,0.40)` |
| Review | `rgba(30,138,94,0.09)` | `#156644` | `rgba(30,138,94,0.38)` |
| Done | `rgba(0,0,0,0.05)` | `rgba(0,0,0,0.27)` | `rgba(0,0,0,0.12)` at 100% |

---

## 02 · Typography

Three roles. One font for UI, one for data, one editorial moment only.

| Role | Font | Weight | Size | Use |
|---|---|---|---|---|
| Editorial | Georgia (system serif) | 400 | 24–28px | Dashboard greeting only. One use. |
| UI – headings | Inter | 600–700 | 13–15px | Card titles, button text, section labels |
| UI – body | Inter | 400–500 | 11–13px | Supporting text, descriptions, nav items |
| Eyebrows | Inter | 700 | 9–10px | `letter-spacing: 0.09–0.10em`, `text-transform: uppercase`. Date stamps, section labels, card subjects. |
| Data / mono | Inter with `font-variant-numeric: tabular-nums` | 700 | 19–22px | Pulse numbers (56 / 27 / 125) |

**Do not use:** Geist, Geist Mono, Lora, DM Mono — these are v1.1 tokens and are deprecated for all new screens.

**The script reader interior** continues to use Geist + Geist Mono for now, until the reader is rebuilt to v2.0 spec.

---

## 03 · Spacing & Radius

### Border radius

| Token | Value | Use |
|---|---|---|
| `--radius-xs` | `4px` | Badges, status tags, small chips |
| `--radius-sm` | `7–8px` | AI bar send button, sidebar icons, small inputs |
| `--radius-md` | `10px` | Action buttons (primary + secondary) |
| `--radius-lg` | `12–13px` | Batch cards |
| `--radius-xl` | `14px` | Hero / greeting card only |

Pill radius (20px+) remains strictly forbidden on any text-containing element.

### Spacing rhythm

| Context | Value |
|---|---|
| Shell padding | `22–28px` |
| Hero card internal padding | `24px sides, 22–24px top/bottom` |
| Card internal padding | `15–16px sides, 14–15px top/bottom` |
| Gap between cards | `10–12px` |
| Gap between sections | `14–16px` |
| Sidebar width | `52–56px` |

---

## 04 · Shadows

Soft diffuse two-layer system. No hard SE-offset shadows on new screens.

| Token | Value | Use |
|---|---|---|
| `--shadow-card` | `0 2px 6px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.045)` | All batch cards |
| `--shadow-card-hover` | `0 4px 14px rgba(0,0,0,0.09), 0 14px 36px rgba(0,0,0,0.07)` | Card hover state |
| `--shadow-hero` | `0 2px 8px rgba(0,0,0,0.07), 0 8px 28px rgba(0,0,0,0.05)` | Hero / greeting card |
| `--shadow-primary-btn` | `0 2px 10px rgba(58,150,195,0.32)` | Primary CTA only |
| `--shadow-secondary-btn` | `0 1px 4px rgba(0,0,0,0.06)` | Secondary buttons |
| `--shadow-sidebar` | — | Sidebar has no shadow. Border only. |

**Script reader** retains hard SE-offset shadows (`3px 3px 0px rgba(0,0,0,0.12)`) on tiles and buttons — these are intentional and correct for that context. Do not apply soft shadows to the script reader until it is rebuilt.

---

## 05 · Background & Texture

### Dashboard / shell
```css
background-color: #EFF0F0;
background-image: repeating-linear-gradient(
  to bottom,
  transparent,
  transparent 27px,
  rgba(0,0,0,0.042) 27px,
  rgba(0,0,0,0.042) 28px
);
```
Horizontal ruled lines at 28px intervals. References exam paper. Applied full-bleed to the shell. Never contained inside a card or panel.

### Script reader
Dot grid retained from v1.1:
```css
background: #ECEAE4;
background-image: radial-gradient(circle, rgba(0,0,0,0.11) 1px, transparent 1px);
background-size: 22px 22px;
```

### Sidebar
```css
background: rgba(255,255,255,0.75–0.82);
backdrop-filter: blur(8px);
border-right: 1px solid rgba(0,0,0,0.07);
```
Semi-transparent white, slightly frosted. The ruled texture bleeds through at the top where the sidebar is shortest.

### Watermark
The DeepMark octopus icon appears as a large ghosted element bottom-right of the shell:
```css
position: fixed;
bottom: -40px; right: -24px;
width: 260–300px;
opacity: 0.06–0.07;
filter: grayscale(40%) brightness(0.9);
pointer-events: none;
```

---

## 06 · Components

### Sidebar

Fixed left column, 52–56px wide.

- **Top:** DeepMark octopus icon (`icon.jpg`), 28–30px, `object-fit: contain`
- **Icons:** Tabler outline webfont (`ti-` classes), 17–18px. No labels. Tooltips on hover.
- **Icon order:** `ti-layout-grid` (Dashboard), `ti-clock` (Recent), `ti-clipboard-list` (Papers), `ti-users` (Students), `ti-chart-bar` (Analytics), `ti-file-text` (Reports)
- **Bottom:** `ti-settings`, then circular avatar (28–30px, `#2878A8`, initials in white, 10px, weight 700)
- **Active state:** `background: rgba(58,150,195,0.12)`, `color: #2878A8`
- **Hover state:** `background: rgba(0,0,0,0.05)`, `color: rgba(0,0,0,0.55)`

### Hero / Greeting Card

Full-width floating card. Reading order: date → greeting → AI bar → (stats if shown).

```
border-radius: 14px
border: 1px solid rgba(0,0,0,0.065)
box-shadow: var(--shadow-hero)
padding: 24px 28px 22px
```

- **Date:** 10px, Inter 700, `letter-spacing: 0.09em`, uppercase, `rgba(0,0,0,0.22)`
- **Greeting:** Georgia serif, 24–28px, weight 400, `letter-spacing: -0.02em`, `color: #0C0C0C`

### AI Bar

Lives inside the hero card. The centrepiece of the dashboard.

```
background: #F7F8F8
border: 1px solid rgba(0,0,0,0.10)
border-radius: 10px
height: 40–44px (not 52px — keep it trim)
padding: 0 6px 0 18px
box-shadow: inset 0 1px 3px rgba(0,0,0,0.04)
```

- **Placeholder:** `"Ask anything about your marking..."` — short, confident
- **Send button:** 36–38px square, `border-radius: 8px`, `background: #3A96C3`, white arrow-up icon

### Action Buttons

Stacked column, 160–188px wide, top-aligned with the hero card.

**Primary (Mark new paper):**
```
height: 36–40px
padding: 0 16px
background: #3A96C3
border-radius: 10px
box-shadow: 0 2px 10px rgba(58,150,195,0.32)
display: flex; align-items: center; justify-content: flex-start; gap: 10px
```
Icon: `ti-plus` at 17px. Text: Inter 700, 12–13px.

**Secondary:**
```
height: 32–36px
padding: 0 14px
background: white
border: 1px solid rgba(0,0,0,0.09)
border-radius: 10px
box-shadow: 0 1px 4px rgba(0,0,0,0.06)
display: flex; align-items: center; justify-content: flex-start; gap: 10px
```
Icon colour: `rgba(0,0,0,0.32)`. Text: Inter 500, 11–12px. 

**Critical:** All buttons are `justify-content: flex-start`. Icon and text are left-aligned with consistent padding. Never centred.

### Batch Cards

3-column grid, `gap: 10–12px`.

```
background: white
border-radius: 12–13px
border: 1px solid rgba(0,0,0,0.062)
box-shadow: var(--shadow-card)
padding: 15–16px
```

Internal structure (top to bottom):
1. **Subject label** — 9px, Inter 700, uppercase, `letter-spacing: 0.10em`, `rgba(0,0,0,0.20)`
2. **Paper name** — 13px, Inter 600, `letter-spacing: -0.01em`, `#0C0C0C`, `line-height: 1.3`
3. **Progress bar** — 2px, `background: rgba(0,0,0,0.05)`, filled by status colour
4. **Footer** — `border-top: 1px solid rgba(0,0,0,0.05)`, `padding-top: 9px`. Script count left, status tag right.

**Hover:** `transform: translateY(-2px)`, `box-shadow: var(--shadow-card-hover)`, `transition: 0.18s`

**No coloured borders.** No top-edge stripes. Status lives only in the pill tag and progress bar.

### Status Tags

```
font-size: 10px
font-weight: 700
letter-spacing: 0.05em
text-transform: uppercase
padding: 3px 8–9px
border-radius: 4px
```

See colour table in §01.

### Pulse / Stat Bar

Optional component. Joined pill with dividers.

```
background: #FAFAFA
border: 1px solid rgba(0,0,0,0.08)
border-radius: 8–9px
overflow: hidden
```

Each item: `padding: 7–8px 14–18px`, `border-right: 1px solid rgba(0,0,0,0.07)`.
Number: 19–22px, Inter 700. Label: 10px, Inter 500, `rgba(0,0,0,0.33)`.
Highlight number (To review): `#2878A8`.

---

## 07 · The Icon & Wordmark

### Assets

Assets are attached directly alongside this document. Filenames for reference:

| Asset | Filename | Use |
|---|---|---|
| Icon | `icon.jpg` | Sidebar (28–30px), watermark (260–300px, opacity 0.06–0.07), favicon fallback |
| Favicon | `Favicon.jpg` | Browser tab — `<link rel="icon" href="Favicon.jpg">` |
| Logo (full) | `Logo_full_large.jpg` | Marketing, onboarding, login screen |
| Logo (small) | `logo_small.jpg` | Compact contexts |

### The icon (`icon.jpg`)

- Used exact. No creative interpretation, no recolouring, no cropping.
- Sidebar: 28–30px, `object-fit: contain`
- Watermark: 260–300px, `opacity: 0.06–0.07`, `filter: grayscale(40%) brightness(0.9)`
- Alongside wordmark in a topbar: 26–28px

### The wordmark (`Logo_full_large.jpg` / `logo_small.jpg`)

- Use the image asset. Do not recreate in CSS or text.
- If wordmark is omitted (icon-only navigation), that is acceptable and preferred for compact layouts.

### Favicon (`Favicon.jpg`)

```html
<link rel="icon" href="Favicon.jpg">
```

---

## 08 · Surface Taxonomy

Every screen is one of these four surface types.

| Type | Description | Examples |
|---|---|---|
| Page | Full URL route. Has sub-routes, nested state. Parent unmounts on navigate. | Dashboard, All papers, Analytics |
| URL-state dialog | Focused destination, parent stays mounted. Linkable via query param. | Script viewer (`?script=…`), Marking job (`?job=…`) |
| Plain dialog | Short, scoped, ≤2 steps. Fully reversible. Not linkable. | Mark new paper, Delete confirm, Grade boundaries |
| Sheet / Drawer | Deep secondary context. Slides over content. | Sidebar nav, AO breakdown panel |

---

## 09 · Script Reader — v1.1 tokens (retained)

The script reader is not yet rebuilt to v2.0. Until it is, these v1.1 tokens remain authoritative for that surface only.

| Token | Value |
|---|---|
| Font | Geist + Geist Mono |
| Editorial | Lora |
| Accent | `#00B4D4` / `#01ADD0` |
| Background | Dot grid, `#ECEAE4` |
| Card shadow | `3px 3px 0px rgba(0,0,0,0.12), 1px 1px 4px rgba(0,0,0,0.07)` |
| Button shadow | `3px 3px 0px rgba(0,0,0,0.20)` |
| Confirm shadow | `2px 2px 0px rgba(0,90,110,0.28)` |
| Max radius | 10px |
| AO1 colour | `#00B4D4` |
| AO2 colour | `#7B52C0` |
| AO3 colour | `#3C8A62` |

When the script reader is rebuilt, it adopts v2.0 tokens in full. The floating AI co-marker bar inside the reader should migrate to match the dashboard AI bar style at that point.

---

## 10 · Anti-patterns

Never do these on any v2.0 screen:

- Coloured card borders (red/green full perimeter = RAG status spreadsheet energy)
- Dot status indicators as the primary status signal
- Centred button content — always `justify-content: flex-start` with left padding
- `border-radius` above 14px
- Pill radius (20px+) on any element containing text
- Soft brand-coloured glows (the primary button shadow is the single exception)
- Inter replaced with any other sans-serif
- Georgia used for anything other than the dashboard greeting
- Status colour in the card background or as a dominant visual element

---

*DeepMark Design System v2.0 · May 2026*  
*Geoff Waugh (design) · Stu Bourhill (engineering)*
