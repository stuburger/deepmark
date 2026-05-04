# Build Plan — Design Tokens & Colour System Hardening (2026-05-04)

Self-contained plan to fix the colour-system gaps surfaced during the script-reader v5 review. Drives the codebase from "single-shade tokens with raw Tailwind leaks" to "OKLCH-derived scales + lint-enforced + LLM-friendly".

---

## Context summary for a fresh chat

**Problem statement.** The codebase has a working DeepMark v1.1 design system (tokens, fonts, shadows, radius — see `apps/web/src/app/globals.css` and `geoff_ui_claude_design/v2/deepmark_tokens.json`). But across ~25 files in `apps/web/src` we found raw Tailwind colour utilities (`bg-green-500`, `bg-amber-100 text-amber-800`, `text-red-500`, etc.) that bypass the system entirely. They render Tailwind's stock palette instead of Geoff's brand greens/ambers/reds, which is why the script-reader screen looks visually inconsistent — the score badge renders our brand `#3C8A62` while adjacent icons render Tailwind's `#22C55E`. Same family, different colour.

**Why it's been silent.** Our existing `lint:tokens` (`apps/web/scripts/checks/no-hex-color-literal.ts`) catches hex/rgb/rgba *string literals*. It does not catch Tailwind utility class names like `bg-green-500`. The leak is invisible to TypeScript and to the existing lint.

**Why single-shade tokens enable the leak.** We define `--success: #3C8A62` as a single hex. Devs needing a soft success bg + dark success text can't write `bg-success-50 text-success-700` because those scales don't exist — so they reach for `bg-green-100 text-green-800` from the Tailwind defaults. The leak is structurally caused: the token shape is too narrow for what the design language demands.

**The fix is multi-layered.** Generate full Tailwind-style scales for brand colours via a build script that reads `tokens.json`, extend the lint to ban raw Tailwind colour utilities, add an LLM-friendly colour lookup to `CLAUDE.md`, extract repeating leak patterns into named primitives (`<StatusDot>`, `<StatusIcon>`, `<SoftChip>`), and codemod the existing usages.

**Source files to read first**:
- `geoff_ui_claude_design/v2/deepmark_tokens.json` — Geoff's canonical brand colours (anchors only, no scales)
- `apps/web/src/app/globals.css` — current DeepMark token mapping, shadcn semantic vars, light/dark blocks
- `apps/web/scripts/checks/no-hex-color-literal.ts` — existing hex-literal lint to extend
- `CLAUDE.md` → "Design System — DeepMark v1.1" section — current design system rules
- Memory: `feedback_brand_color.md` — locked teal `#01ADD0`, page bg history, brand direction

**Decisions already made by Stuart on 2026-05-04 — do not relitigate:**

| Question | Decision |
|---|---|
| Use scales or stay single-shade? | Generate full Tailwind-style scales (50-950) for brand colours |
| Algorithmic generation vs hand-pick? | Algorithmic (OKLCH), with hand-override for anchors only |
| Which colours get scaled? | `teal` (brand), `success`, `warning`, `error`, `ink` (greyscale). Five scales total, 55 generated tokens. |
| Use semantic-named scales or override Tailwind's? | **Semantic-named** (`bg-success-100`, not `bg-green-100`). Don't pollute Tailwind's stock palette. |
| Scale generator tool | **`culori` library** — OKLCH-based, matches Tailwind v4's approach. Modern best practice. |
| Build script up-front or paste-once? | **Script-first.** Build the generator before the generated file exists. `tokens.json` is the source; `globals.tokens.css` is derived from day one. |
| `<SoftChip>` primitive | **In scope** — multiple chip patterns in `submission-grid-config.ts`, `exam-paper-analytics-tab.tsx` justify the abstraction. |
| Greyscale `--ink-*` scale | **Yes** — consistent with the four other brand scales. Anchor: `ink-950 = #1A1A1A`. |
| Source of truth | `geoff_ui_claude_design/v2/deepmark_tokens.json`. `globals.tokens.css` is derived. |

---

## What's already in place — don't rebuild

- DeepMark v1.1 design system (tokens, fonts, shadows, radius, dot-grid)
- Single-shade brand tokens: `--teal`, `--success`, `--warning`, `--destructive`, `--phase-*`, `--status-*`, `--ink`, `--ink-secondary`, `--ink-tertiary`, `--ink-disabled`
- shadcn semantic mapping (`--primary`, `--secondary`, `--card`, etc.) wired through `@theme inline`
- `lint:tokens` script catching hex/rgb/rgba literals (extending, not replacing)
- 7 button variants (post-shake-down): `default`, `secondary`, `confirm`, `outline`, `ghost`, `destructive`, `link`
- ScoreBadge / GradeBadge using brand tokens correctly (`bg-success`, `bg-warning`, `bg-destructive`)
- `CLAUDE.md` design system section with spec → shadcn translation table
- Memory: `feedback_brand_color.md`, `feedback_geoff_april_2026.md`

---

## Target architecture

### Token layering

```
geoff_ui_claude_design/v2/deepmark_tokens.json    ← AUTHORITATIVE SOURCE (Geoff owns)
                  ↓ (build script reads anchors)
apps/web/src/app/globals.tokens.css               ← GENERATED (do not edit)
                  ↓ (imported by)
apps/web/src/app/globals.css                      ← hand-edited (page rules, body, custom selectors)
                  ↓ (Tailwind v4 picks up @theme)
Tailwind utility classes: bg-success-100, text-teal-700, border-error-300, text-ink-900, ...
```

### Layered enforcement against colour leaks

```
Layer 1  TypeScript           — Variant unions on Button et al. catch wrong variant names
Layer 2  Lint (extended)      — Catches raw Tailwind colour utilities (bg-green-500, etc.)
                                with helpful error messages pointing at the right token
Layer 3  Named primitives     — <StatusDot kind="success" />, <StatusIcon />, <SoftChip />
                                so devs choose meaning, not colour
Layer 4  CLAUDE.md table      — "When designer says X, write Y" lookup
Layer 5  tokens.json sync     — Geoff's canonical values, single source of truth
```

After all five layers, an LLM (or a human) literally cannot ship a wrong colour without immediate failure + correct replacement in the error message.

---

## Phase 1 — Build the token generator + generate scales (≈90 min)

**Script-first approach:** the generator script and the generated CSS land together in one phase. `tokens.json` is the single source of truth from day one.

### 1.1. Add the dependency

```bash
cd apps/web && bun add -D culori @types/culori
```

`culori` is ~50KB, OKLCH-native, used internally by Tailwind v4's own palette tooling.

### 1.2. Define the five brand anchors (read from `tokens.json`)

The generator reads these anchors and derives 11-shade scales from each:

| Scale | Anchor | Anchor position | Source key in tokens.json |
|---|---|---|---|
| `teal` | `#01ADD0` | `teal-500` (canonical brand) | `color.accent` |
| `success` | `#3C8A62` | `success-500` (canonical brand) | `color.success` |
| `warning` | `#C4883A` | `warning-500` (canonical brand) | `color.warning` |
| `error` | `#C23B3B` | `error-500` (canonical brand) | `color.error` |
| `ink` | `#1A1A1A` | **`ink-950`** (the darkest — ink is the dark) | `color.ink` |

Note: `ink` is special — its anchor sits at `950` because the brand value is "near-black" (the darkest shade). Lighter shades are derived upward. The other four anchors sit at `500` (the canonical mid-shade).

The generator must support per-scale anchor positioning to handle this.

### 1.3. Build the generator

**File**: `apps/web/scripts/generate-tokens.ts`

```ts
#!/usr/bin/env bun
/**
 * Reads geoff_ui_claude_design/v2/deepmark_tokens.json and generates the
 * brand-colour scale CSS at apps/web/src/app/globals.tokens.css.
 *
 * Five scales: teal, success, warning, error, ink. 11 shades each (50-950).
 * Anchor shades come from tokens.json and stay exact. Other shades are
 * OKLCH-derived for perceptual uniformity (matches Tailwind v4's approach).
 *
 * Usage:
 *   bun gen:tokens         — write the file
 *   bun gen:tokens --check — exit non-zero if output would differ from on-disk
 *
 * The --check mode is wired into CI; any drift between tokens.json and the
 * committed CSS fails the build.
 */
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { oklch, formatHex, type Oklch } from "culori"

const TOKENS_PATH = resolve(
  __dirname,
  "../../../geoff_ui_claude_design/v2/deepmark_tokens.json",
)
const OUTPUT_PATH = resolve(__dirname, "../src/app/globals.tokens.css")

const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const

// Lightness curve calibrated to match Tailwind v4's own scales (oklch L values).
// Anchors override the value for whichever shade they sit at.
const L_CURVE: Record<number, number> = {
  50: 0.985,  100: 0.967, 200: 0.928, 300: 0.870, 400: 0.745,
  500: 0.620, 600: 0.530, 700: 0.450, 800: 0.380, 900: 0.290, 950: 0.205,
}

type ScaleSpec = {
  name: string
  anchorHex: string
  anchorAt: number  // which shade the anchor sits at (500 for most, 950 for ink)
}

function generateScale({ name, anchorHex, anchorAt }: ScaleSpec): string {
  const anchor = oklch(anchorHex) as Oklch
  if (!anchor) throw new Error(`Could not parse ${anchorHex}`)

  // Use the anchor's hue + chroma for all shades. Lightness from L_CURVE.
  const lines: string[] = [
    `\t/* ${name.toUpperCase()} — anchor: ${name}-${anchorAt} = ${anchorHex.toUpperCase()} */`,
  ]

  for (const shade of SHADES) {
    const hex = shade === anchorAt
      ? anchorHex.toLowerCase()
      : formatHex({
          mode: "oklch",
          l: L_CURVE[shade],
          c: scaleChroma(anchor.c ?? 0, L_CURVE[shade]),
          h: anchor.h,
        })
    lines.push(`\t--color-${name}-${shade}: ${hex};`)
  }

  return lines.join("\n")
}

// Chroma drops at the extremes (very light / very dark) to match Tailwind v4's
// behaviour — at L=0.985 a high chroma reads neon, so we taper.
function scaleChroma(baseChroma: number, l: number): number {
  if (l > 0.95) return baseChroma * 0.3
  if (l > 0.85) return baseChroma * 0.6
  if (l < 0.25) return baseChroma * 0.7
  return baseChroma
}

const tokens = JSON.parse(readFileSync(TOKENS_PATH, "utf8"))

const scales: ScaleSpec[] = [
  { name: "teal",    anchorHex: tokens.color.accent.value,  anchorAt: 500 },
  { name: "success", anchorHex: tokens.color.success.value, anchorAt: 500 },
  { name: "warning", anchorHex: tokens.color.warning.value, anchorAt: 500 },
  { name: "error",   anchorHex: tokens.color.error.value,   anchorAt: 500 },
  { name: "ink",     anchorHex: tokens.color.ink.value,     anchorAt: 950 },
]

const css = `/*
 * GENERATED FILE — DO NOT EDIT BY HAND.
 *
 * Source: geoff_ui_claude_design/v2/deepmark_tokens.json
 * Generator: apps/web/scripts/generate-tokens.ts
 * Run: bun gen:tokens
 *
 * Anchors come from Geoff's canonical brand colours.
 * All other shades are OKLCH-derived for perceptual uniformity.
 * To change a brand colour, edit tokens.json and re-run this script.
 */

@theme inline {
${scales.map(generateScale).join("\n\n")}
}
`

if (process.argv.includes("--check")) {
  const onDisk = readFileSync(OUTPUT_PATH, "utf8")
  if (onDisk.trim() !== css.trim()) {
    console.error("× globals.tokens.css is out of sync with tokens.json")
    console.error("  Run `bun gen:tokens` and commit the result.")
    process.exit(1)
  }
  console.log("✓ globals.tokens.css matches tokens.json")
} else {
  writeFileSync(OUTPUT_PATH, css)
  console.log(`✓ Wrote ${OUTPUT_PATH}`)
}
```

### 1.4. Add to `package.json`

Root `package.json`:
```json
"scripts": {
  ...
  "gen:tokens": "bun --cwd apps/web scripts/generate-tokens.ts",
  "gen:tokens:check": "bun --cwd apps/web scripts/generate-tokens.ts --check"
}
```

### 1.5. Run the generator

```bash
bun gen:tokens
```

Output: `apps/web/src/app/globals.tokens.css` containing 55 `--color-{scale}-{shade}` declarations under `@theme inline`.

### 1.6. Wire generated file into the import chain

`apps/web/src/app/globals.css` — add at the top after the existing imports:

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";
@import "./globals.tokens.css";  /* GENERATED — do not edit. See bun gen:tokens */
```

### 1.7. Re-point existing single-shade tokens at canonical scale shades

In `globals.css`'s `:root` block:

```css
/* Backwards-compat aliases — `bg-success`, `bg-destructive`, `text-ink` still work.
   New code should prefer the explicit scale shade (`bg-success-500`, `text-ink-900`). */
--success:     var(--color-success-500);
--warning:     var(--color-warning-500);
--destructive: var(--color-error-500);
--teal:        var(--color-teal-500);
--teal-dark:   var(--color-teal-600);

/* The opacity-based ink tokens stay as-is — they're a different mental model
   (alpha-on-paper) and product code uses them heavily. The new --color-ink-*
   scale is for cases where a true ink-tinted shade is needed (not alpha). */
--ink:           var(--color-ink-950);  /* same value as before, now derived */
--ink-secondary: rgba(0, 0, 0, 0.45);
--ink-tertiary:  rgba(0, 0, 0, 0.28);
--ink-disabled:  rgba(0, 0, 0, 0.18);
```

### 1.8. CI gate

Add to existing CI config (or create one):

```yaml
- name: Verify design tokens are in sync
  run: bun gen:tokens:check
```

This prevents drift — anyone hand-editing `globals.tokens.css` without re-running the script will fail CI.

### 1.9. Verify

- `bun gen:tokens` → writes `globals.tokens.css`
- `bun gen:tokens:check` → exits 0
- Hand-edit a value in `globals.tokens.css`, run `bun gen:tokens:check` → exits non-zero with helpful message; revert.
- `bunx tsc --noEmit` → green
- `bun lint:tokens` → still green (we haven't yet extended the lint; existing hex-literal check still runs)
- Eyeball: existing `bg-success` / `bg-destructive` rendering identical to before (we just point them at the same canonical shade through a scale)

---

## Phase 2 — Extend lint to ban raw Tailwind colour utilities (≈30 min)

### 2.1. Update `apps/web/scripts/checks/no-hex-color-literal.ts`

Add a second rule alongside the hex-literal check:

```ts
// Detects: bg-green-500, text-amber-700, border-red-100, ring-blue-300,
// fill-emerald-500, stroke-rose-400 — anything reaching outside the design
// tokens for colour. Excludes the 5 brand scales we own (teal, success,
// warning, error, ink). Excludes Tailwind's neutral palette (slate, gray,
// zinc, neutral, stone) which is allowed for true greyscale chrome.

const RAW_TAILWIND_COLOR_UTILITY = new RegExp(
  String.raw`\b(bg|text|border|ring|fill|stroke|outline|decoration|caret|divide|placeholder|accent|shadow)-` +
  `(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)` +
  String.raw`-\d+(/\d+)?\b`,
  "g",
)

const SUGGESTIONS: Record<string, string> = {
  // Map common raw-Tailwind patterns to their token replacements.
  "bg-green-500":    "bg-success-500 (canonical green) or bg-success",
  "bg-green-100":    "bg-success-50 or bg-success-100 (token scale)",
  "bg-green-50":     "bg-success-50",
  "text-green-500":  "text-success-500 or <StatusIcon kind=\"success\" /> for icons",
  "text-green-700":  "text-success-700",
  "text-green-800":  "text-success-800",
  "bg-amber-100":    "bg-warning-50 or bg-warning-100 (or <SoftChip kind=\"warning\" />)",
  "text-amber-800":  "text-warning-800",
  "bg-amber-500":    "bg-warning-500 or bg-warning",
  "text-amber-500":  "text-warning",
  "bg-red-500":      "bg-error-500 or bg-destructive",
  "bg-red-50":       "bg-error-50",
  "text-red-700":    "text-error-700 or text-destructive",
  "text-red-500":    "text-error-500 or text-destructive",
  "bg-cyan-500":     "bg-teal-500 (DeepMark teal, not Tailwind cyan)",
  "bg-blue-500":     "bg-teal-500 or bg-primary",
  // ...
}

function checkFile(filePath: string, content: string): Violation[] {
  const violations: Violation[] = [...checkHexLiterals(filePath, content)]

  for (const match of content.matchAll(RAW_TAILWIND_COLOR_UTILITY)) {
    const cls = match[0]
    const suggestion =
      SUGGESTIONS[cls.split("/")[0]] ?? "use a DeepMark token from globals.tokens.css"
    violations.push({
      file: filePath,
      line: lineNumberFromOffset(content, match.index ?? 0),
      message: `'${cls}' is not a sanctioned colour. Use ${suggestion}. See CLAUDE.md → Colour lookup table.`,
    })
  }

  return violations
}
```

### 2.2. Update allowlist if needed

Some shadcn-internal components may use raw Tailwind colours where tokens don't fit (chart fills, etc.). Allowlist them by exact path or `chart/` prefix.

### 2.3. Run it — first pass tells us the scope

```bash
bun lint:tokens 2>&1 | tee /tmp/colour-leak-audit.txt
wc -l /tmp/colour-leak-audit.txt
```

Expected: 25-40 violations across ~15-25 files. This is the worklist for Phase 5.

### 2.4. Verify

Run on the codebase as-is, expect non-zero exit and helpful per-violation messages including correct replacements.

---

## Phase 3 — `CLAUDE.md` colour lookup table (≈15 min)

Add a new subsection to the existing "Design System — DeepMark v1.1" block:

```markdown
### Colour lookup — when in doubt, use this table

| When the designer says... | Write |
|---|---|
| "the teal", "brand teal", "primary CTA" | `bg-primary` (= `bg-teal-500`) |
| "teal hover", "darker teal" | `hover:bg-teal-600` |
| "soft teal tint", "teal background" | `bg-teal-50` or `bg-teal-100` |
| "active state tint", "selected" | `bg-accent` (= teal/8% alpha) |
| "white tile", "card", "paper white" | `bg-card` |
| "page bg", "paper" | `bg-background` |
| "muted bg", "sidebar surface" | `bg-muted` |
| "ink", "body text" | `text-foreground` (= `text-ink-950`) |
| "secondary text", "supporting copy" | `text-muted-foreground` |
| "label colour", "eyebrow", "metadata" | `text-ink-tertiary` |
| "near-black emphasis text" | `text-ink-900` |
| "subtle ink for icons" | `text-ink-500` or `text-ink-700` |
| "very light grey bg" | `bg-ink-50` |
| "success green" (badge, dot, soft chip) | `bg-success-50 text-success-700` or `bg-success` for filled |
| "warning amber" (badge, dot, soft chip) | `bg-warning-50 text-warning-800` or `bg-warning` for filled |
| "error red", "destructive", "fail" | `bg-destructive` / `text-destructive` for filled, `bg-error-50 text-error-700` for soft |
| "subtle border" | `border-border-quiet` |
| "card border" | `border-border` |
| "dotted divider" | `border-dotted border-border-quiet` |

**STOP and use this table** if you're tempted to write `bg-green-500`, `bg-amber-100`, `text-red-700`, `bg-blue-500`, `bg-cyan-500`, etc. The lint will reject them anyway — and the error message will tell you the correct replacement.

**Use named primitives** (`<StatusDot>`, `<StatusIcon>`, `<SoftChip>`) for repeating patterns rather than re-deriving the token combination every time.
```

---

## Phase 4 — Named primitives for repeating leak patterns (≈90 min)

Reduce the surface area where devs choose colours at all.

### 4.1. `<StatusDot>` — replaces `bg-green-500` / `bg-amber-500` / `bg-red-500` round dots

**File**: `apps/web/src/components/ui/status-dot.tsx`

```tsx
import { cn } from "@/lib/utils"

const KIND_TO_BG = {
  success: "bg-success",
  warning: "bg-warning",
  error:   "bg-destructive",
  info:    "bg-primary",
  neutral: "bg-ink-tertiary",
} as const

type StatusDotProps = {
  kind: keyof typeof KIND_TO_BG
  size?: "xs" | "sm"  // 6px / 8px
  className?: string
}

export function StatusDot({ kind, size = "sm", className }: StatusDotProps) {
  return (
    <span
      className={cn(
        "inline-block shrink-0 rounded-full",
        size === "xs" ? "size-1.5" : "size-2",
        KIND_TO_BG[kind],
        className,
      )}
      aria-hidden
    />
  )
}
```

**Replaces in codebase**: ~8 inline `bg-green-500`/`bg-amber-500`/`bg-red-500` rounded-full spans.

### 4.2. `<StatusIcon>` — replaces `text-green-500`/`text-amber-500` icon colour

**File**: `apps/web/src/components/ui/status-icon.tsx`

```tsx
import { cn } from "@/lib/utils"
import {
  AlertCircle, CheckCircle2, type LucideIcon,
  XCircle, Zap,
} from "lucide-react"

const KIND_TO_ICON: Record<string, LucideIcon> = {
  success:  CheckCircle2,
  warning:  Zap,
  error:    XCircle,
  info:     AlertCircle,
}
const KIND_TO_COLOUR = {
  success: "text-success",
  warning: "text-warning",
  error:   "text-destructive",
  info:    "text-primary",
}

export function StatusIcon({
  kind,
  className,
  ...rest
}: {
  kind: keyof typeof KIND_TO_ICON
  className?: string
} & React.SVGAttributes<SVGSVGElement>) {
  const Icon = KIND_TO_ICON[kind]
  return <Icon className={cn(KIND_TO_COLOUR[kind], className)} {...rest} />
}
```

**Replaces in codebase**: ~10 inline `<CheckCircle2 className="text-green-500" />` / `<Zap className="text-amber-500" />` patterns in `event-log.tsx`, `document-thumbnail.tsx`, `document-upload-cards.tsx`.

### 4.3. `<SoftChip>` — replaces `bg-X-100 text-X-800` chip patterns

**File**: `apps/web/src/components/ui/soft-chip.tsx`

```tsx
import { cn } from "@/lib/utils"

const KIND_TO_CLASS = {
  success: "bg-success-50 text-success-800 border-success-200",
  warning: "bg-warning-50 text-warning-800 border-warning-200",
  error:   "bg-error-50 text-error-700 border-error-200",
  info:    "bg-teal-50 text-teal-800 border-teal-200",
  neutral: "bg-muted text-muted-foreground border-border",
}

export function SoftChip({
  kind,
  children,
  className,
}: {
  kind: keyof typeof KIND_TO_CLASS
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
        KIND_TO_CLASS[kind],
        className,
      )}
    >
      {children}
    </span>
  )
}
```

**Replaces in codebase**: `submission-grid-config.ts` chips, `exam-paper-analytics-tab.tsx` score chips. ~5-8 patterns.

---

## Phase 5 — Codemod the existing leaks (≈90-120 min)

Use Phase 2's lint output as the worklist. For each violation:

1. Identify the pattern: dot, icon, chip, soft bg, etc.
2. Replace with primitive (Phase 4) OR token-based class.
3. Verify the file still typechecks.

### Expected files to touch (rough estimate from earlier audit)

```
apps/web/src/app/admin/overview/page.tsx
apps/web/src/app/admin/settings/bulk-update-models-dialog.tsx
apps/web/src/app/teacher/mark/papers/[examPaperId]/submissions/[jobId]/event-log.tsx
apps/web/src/app/teacher/mark/papers/[examPaperId]/submissions/[jobId]/scan-panel.tsx
apps/web/src/app/teacher/mark/papers/[examPaperId]/submissions/[jobId]/stage-pip.tsx
apps/web/src/app/teacher/exam-papers/exam-paper-card.tsx
apps/web/src/app/teacher/exam-papers/[id]/staging-review-toolbar.tsx
apps/web/src/app/teacher/exam-papers/[id]/document-upload-cards.tsx
apps/web/src/app/teacher/exam-papers/[id]/document-thumbnail.tsx
apps/web/src/app/teacher/exam-papers/[id]/marking-guidance-button.tsx
apps/web/src/app/teacher/exam-papers/[id]/exam-paper-analytics-tab.tsx
apps/web/src/app/teacher/exam-papers/[id]/list-view-script-section.tsx
apps/web/src/app/teacher/exam-papers/[id]/submission-grid-config.ts
apps/web/src/app/teacher/exam-papers/[id]/readiness-strip.tsx
apps/web/src/app/teacher/exam-papers/[id]/exam-paper-helpers.tsx
apps/web/src/app/teacher/exam-papers/[id]/exam-paper-questions-card.tsx
... ~5-8 more
```

### Mapping reference

| Found | Replace with |
|---|---|
| `bg-green-500` | `bg-success-500` (or `<StatusDot kind="success" />` if it's a small dot) |
| `bg-green-100 text-green-800` | `bg-success-50 text-success-800` (or `<SoftChip kind="success" />`) |
| `text-green-500` / `text-green-600` | `text-success-500` (or `<StatusIcon kind="success" />` for icons) |
| `bg-green-500/40` | `bg-success-500/40` |
| `bg-amber-100` | `bg-warning-50` or `bg-warning-100` |
| `bg-amber-100 text-amber-800` | `<SoftChip kind="warning" />` |
| `text-amber-500` | `text-warning-500` |
| `bg-red-500` | `bg-error-500` (or `bg-destructive` if it's a destructive UI signal) |
| `bg-red-50 text-red-700` | `bg-error-50 text-error-700` (or `<SoftChip kind="error" />`) |
| `bg-blue-*`, `bg-cyan-*` | Almost certainly should be `bg-teal-*` — confirm intent and replace |

### Verify

After each batch of files: `bunx tsc --noEmit` and `bun lint:tokens`. Both must be green before moving on. The lint will tell us when we're done — when `bun lint:tokens` exits 0.

---

## Phase 6 — Push results back to Geoff (≈15 min)

Once scales are generated, send Geoff the resulting palette so he can:

1. Review the derived shades (open `apps/web/src/app/globals.tokens.css` or render them visually)
2. Approve or override any specific shade he doesn't like (e.g., "make `teal-100` slightly cooler")
3. Update `tokens.json` v1.2 with the full scales (not just anchors)

Once `tokens.json` v1.2 ships with full scales, our build script picks them up automatically — anchors continue to drive derivation, but Geoff can override individual shades by adding them to `tokens.json` and the script can prefer the explicit value when present.

To support shade overrides, extend the generator: if `tokens.json` defines `color.success-100` (a specific shade by name), use that instead of the OKLCH-derived value. Otherwise, derive. This gives Geoff per-shade control without losing the algorithmic default.

---

## Phase 7 — Verify everything (≈20 min)

```bash
bun gen:tokens                    # writes globals.tokens.css
bun gen:tokens:check              # verifies output matches tokens.json
bun --cwd apps/web bunx tsc --noEmit
bun lint:tokens                   # exit 0 — no raw Tailwind colour utilities, no hex literals
bunx biome check                  # green
```

Manual walk:
- Visit `/teacher/mark/papers/<id>/submissions/<jobId>` — score badge + adjacent status icons share the same colour family (no `#22C55E` vs `#3C8A62` mismatch)
- Visit `/teacher/exam-papers/<id>` — card status borders match design system (no Tailwind defaults)
- Visit `/teacher` dashboard — card status badges look correct

---

## Linear tickets to create

All in the **UI** project (`c2b01f45-4a6d-4ad0-b26a-c4730296f8c4`).

### Discuss with Geoff (label `Discuss with Geoff`)

**Title**: `Design tokens v1.2 — push generated brand-colour scales into tokens.json`

**Body**:
```
## Context
We've generated 11-shade scales for teal, success, warning, error, ink from
the v1.1 anchors (the existing -500 / ink-950 values). The derived shades
are OKLCH-based and look correct in product, but Geoff hasn't reviewed them.

## What's needed
1. Geoff reviews the 55 generated shades (in apps/web/src/app/globals.tokens.css)
2. Approves them or overrides specific shades he doesn't like
3. Updates geoff_ui_claude_design/v2/deepmark_tokens.json to v1.2 with full
   scales (not just the anchors)

## Reference
docs/build-plan-2026-05-04-design-tokens-and-color-system.md
```

### Standard ticket

**Title**: `Add OKLCH-based design-token build script + CI gate`

**Body**:
```
## Context
We need tokens.json to be the single source of truth and globals.tokens.css
to be derived. Manual sync invites drift (we already had border-subtle 0.04
vs spec 0.08 from a hand-paste).

## What's needed
1. Build apps/web/scripts/generate-tokens.ts that reads tokens.json,
   generates OKLCH scales for teal/success/warning/error/ink, writes
   apps/web/src/app/globals.tokens.css
2. Add `bun gen:tokens` and `bun gen:tokens:check` scripts to package.json
3. Wire `bun gen:tokens:check` into CI as a gate
4. Document the workflow in CLAUDE.md (single source of truth = tokens.json)

## Reference
docs/build-plan-2026-05-04-design-tokens-and-color-system.md, Phase 1
```

### Standard ticket

**Title**: `Extend lint:tokens to ban raw Tailwind colour utilities`

**Body**:
```
## Context
~25 files in apps/web/src use raw Tailwind colour utilities (bg-green-500,
text-amber-700, etc.) instead of DeepMark tokens. Our existing lint catches
hex literals but not utility class names.

## What's needed
1. Extend apps/web/scripts/checks/no-hex-color-literal.ts to detect
   bg-{red|amber|green|blue|...}-{50..950} patterns
2. Provide helpful error messages mapping each common pattern to the
   right token replacement
3. Allowlist any genuinely-required exceptions (chart fills, etc.)
4. Run on the codebase, fail CI

## Reference
docs/build-plan-2026-05-04-design-tokens-and-color-system.md, Phase 2
```

### Standard ticket

**Title**: `Codemod existing raw Tailwind colour usages to DeepMark tokens`

**Body**:
```
## Context
After lint extension lands, ~25 files will fail the lint with raw Tailwind
colour utility usages. These need to be replaced with DeepMark tokens.

## What's needed
Replace each raw utility with the DeepMark equivalent following the mapping
table in the build plan. Use new <StatusDot> / <StatusIcon> / <SoftChip>
primitives where appropriate.

## Reference
docs/build-plan-2026-05-04-design-tokens-and-color-system.md, Phase 5
```

### Standard ticket

**Title**: `Extract <StatusDot> / <StatusIcon> / <SoftChip> primitives`

**Body**:
```
## Context
Status indicators (bg-green-500 dots, text-amber-500 icons) and chip patterns
(bg-X-100 text-X-800) repeat across many files. Each occurrence is a hand-
rolled colour decision. Wrapping them in named primitives removes the
colour decision entirely.

## What's needed
1. Build apps/web/src/components/ui/status-dot.tsx with `kind` prop
2. Build apps/web/src/components/ui/status-icon.tsx with `kind` prop
3. Build apps/web/src/components/ui/soft-chip.tsx with `kind` prop
4. Document usage in CLAUDE.md
5. Use during the Phase 5 codemod

## Reference
docs/build-plan-2026-05-04-design-tokens-and-color-system.md, Phase 4
```

---

## Out of scope (don't include in this build)

- Changing `--radius-sm` from 3px to 5px (tokens.json says 5, we have 3 for shadcn-compat). Separate decision, post-launch.
- Generating scales for shadcn semantic tokens beyond the five brand colours (no clear product need).
- Replacing Tailwind's neutral palette (`slate`, `gray`, `zinc`, `neutral`, `stone`) — these are allowed for true greyscale chrome.
- Changing the existing alpha-based ink tokens (`--ink-secondary`, `--ink-tertiary`, `--ink-disabled`) — they remain because product code uses them heavily and they're a valid different mental model. The new `--color-ink-*` scale is additive, not a replacement.

---

## File inventory (delta)

**Add**:
- `apps/web/scripts/generate-tokens.ts` (build script)
- `apps/web/src/app/globals.tokens.css` (generated CSS)
- `apps/web/src/components/ui/status-dot.tsx`
- `apps/web/src/components/ui/status-icon.tsx`
- `apps/web/src/components/ui/soft-chip.tsx`

**Modify**:
- `apps/web/src/app/globals.css` — import `globals.tokens.css`, re-point single-shade aliases at canonical scale shades
- `apps/web/scripts/checks/no-hex-color-literal.ts` — add raw-utility detection rule
- `apps/web/package.json` — add `culori` + `@types/culori` deps
- Root `package.json` — add `gen:tokens` and `gen:tokens:check` scripts
- `CLAUDE.md` — add Colour lookup table to design system section
- `geoff_ui_claude_design/v2/deepmark_tokens.json` — Geoff updates to v1.2 with full scales (Phase 6)
- ~20-25 files containing raw Tailwind colour utilities (Phase 5 codemod)

**Add to CI**:
- `bun gen:tokens:check` runs on every PR

---

## Total scope

- Phase 1 (build script + generated CSS + CI gate): 90 min
- Phase 2 (lint extension): 30 min
- Phase 3 (CLAUDE.md table): 15 min
- Phase 4 (primitives — StatusDot, StatusIcon, SoftChip): 90 min
- Phase 5 (codemod): 90-120 min
- Phase 6 (Geoff sync): 15 min (mostly his time)
- Phase 7 (verify): 20 min

**End-to-end: roughly 1 dev-day, plus Geoff's review time.**

After this, the colour-leak class of bug is architecturally impossible: tokens.json is single source of truth, build script enforces sync, lint catches drift at every PR, primitives encode meaning, CLAUDE.md tells the LLM exactly what to write.

---

## Implementation order rationale

The phases must run in this order:

1. **Phase 1 first** because everything else depends on the scales existing. Without `bg-success-50`, the lint can't suggest replacements, the primitives can't reference them, and the codemod has nothing to migrate to.
2. **Phase 2 next** because it surfaces the worklist. The lint output is the codemod plan.
3. **Phase 3 (CLAUDE.md)** in parallel with Phase 2 — it's docs, no code dependency.
4. **Phase 4 (primitives)** before Phase 5 (codemod) so the codemod can reach for the primitives.
5. **Phase 5 (codemod)** is the bulk of the work but only mechanical once 1-4 are done.
6. **Phase 6 (Geoff)** is last because we need to show him the rendered scales he's reviewing.
7. **Phase 7 (verify)** caps the work.
