// Phase 6 design-system guard rail.
//
// Catches hex / rgb() / rgba() colour literals in component code. Every colour
// must come from a CSS variable defined in `apps/web/src/app/globals.css` (which
// in turn maps the DeepMark v1.1 design tokens onto shadcn's semantic vars).
// See `geoff_ui_claude_design/v2/deepmark_design_system.html` for the spec.
//
// Detects two patterns:
//   1. Tailwind arbitrary values: `bg-[#1A1A1A]`, `text-[rgba(0,0,0,0.5)]`,
//      `shadow-[3px_3px_0_#000]`, etc. — anywhere `[ ... # ... ]` or
//      `[ ... rgb( ... ) ]` appears in a string literal.
//   2. Plain hex string literals: `"#01ADD0"`, `'#fff'`. Used in inline
//      styles (`style={{ color: "#01ADD0" }}`) and colour constant arrays.
//
// Each violation is mapped to a suggested fix where possible (e.g.
// `bg-[#01ADD0]` → `bg-primary`).
//
// Allowlisted files have legitimate reasons to keep raw hex; the comment next
// to each entry explains why. Adding a file to ALLOWED_FILES needs a reviewer
// to agree the value really cannot be expressed as a token.

import * as fs from "node:fs"
import * as path from "node:path"

export type Violation = {
	file: string
	line: number
	rule:
		| "no-hex-arbitrary-value"
		| "no-hex-string-literal"
		| "no-raw-tailwind-color"
	matched: string
	message: string
}

// Files (or directory prefixes ending in "/") where raw hex is acceptable.
// Each entry must come with a one-line justification — review before adding
// more.
const ALLOWED_PATHS: ReadonlyArray<string> = [
	// Google brand SVG colours on the OAuth login button — third-party brand,
	// cannot use DeepMark tokens.
	"src/app/login/page.tsx",
	// Recharts CSS-class selectors (`[stroke='#ccc']`) target HTML the library
	// injects with hard-coded attributes — the hex is a selector, not a value.
	"src/components/ui/chart.tsx",
	// Bounding-box overlays for the scan viewer. Drawn directly on canvas, and
	// the legend / hit-target / token-overlay siblings document the same mark
	// palette (tick=green, cross=red, box=purple, underline=blue, etc.) so
	// they share the directory allowlist. The mark palette lives in
	// `--mark-*` CSS vars in globals.css; the BoundingBoxViewer subtree is the
	// one place these colours are referenced as raw values.
	// TODO(phase-5): migrate to read --mark-* CSS vars via getComputedStyle so
	// these match the editor's annotation marks.
	"src/components/BoundingBoxViewer.tsx",
	"src/components/BoundingBoxViewer/",
	// Collaboration cursor palette — random per-user colour pool, not part of
	// the brand system. Could become a token array later but low priority.
	"src/components/annotated-answer/use-collaborators.ts",
	"src/lib/users/use-current-user.ts",
	// Domain badge palette per the v1.1 design system. The spec defines specific
	// AO/status/WWW/EBI colours that don't appear anywhere else in the system,
	// so adding 14+ named tokens to globals.css for one component would bloat
	// the namespace. Treated as the one place these spec values live.
	"src/components/ui/badge.tsx",
	// Legacy AO palette used by SVG overlays and @react-pdf. Predates the v1.1
	// spec — its AO colours (blue/pink/green) do not match the spec's badge
	// palette (teal/purple/forest).
	// TODO(phase-5): reconcile with badge.tsx variants and migrate consumers.
	"src/lib/marking/ao-palette.ts",
	// Subject palette — one distinct hue per subject (biology=green, physics=
	// blue, etc.) so a stack of cards reads at a glance. Intentionally wider
	// than the brand scales; same justification as ao-palette. Centralised
	// here so the rainbow doesn't leak into product UI for non-subject signals.
	"src/lib/subjects.ts",
	// PDF export via @react-pdf/renderer runs outside the browser — CSS
	// variables don't apply, so all colours must be raw hex. The PDF subtree
	// is a separate rendering target.
	"src/lib/marking/pdf-export/",
	// Design system reference page. Its entire job is to *display* hex values
	// alongside the rendered swatches as a visual key for the design team.
	// The hex values shown are the same ones defined in tokens.json /
	// globals.tokens.css — surfacing them here is the feature, not a leak.
	"src/app/design-system/",
]

function isAllowedPath(rel: string): boolean {
	for (const entry of ALLOWED_PATHS) {
		if (entry.endsWith("/")) {
			if (rel.startsWith(entry)) return true
		} else if (rel === entry) {
			return true
		}
	}
	return false
}

// Tailwind arbitrary value containing a hex literal or rgb/rgba call.
// Matches things like `bg-[#1A1A1A]`, `text-[rgba(0,0,0,0.5)]`,
// `shadow-[3px_3px_0_#000]`. Must contain a `[` then `#` or `rgb(`/`rgba(`
// and a closing `]`.
const ARBITRARY_HEX_RE =
	/\[[^\]]*(?:#[0-9a-fA-F]{3,8}|rgba?\([^\]]+\))[^\]]*\]/g

// Hex string literal: a 3-, 4-, 6-, or 8-digit hex prefixed with `#` inside a
// single- or double-quoted string. Excludes longer runs (e.g. `#abcdef0123`)
// and template strings.
const HEX_STRING_RE = /(["'])(#[0-9a-fA-F]{3,8})\1/g

// Raw Tailwind colour utilities. Catches `bg-green-500`, `text-amber-700`,
// `border-red-100`, `ring-blue-300`, `fill-emerald-500`, etc. — anywhere a
// colour utility reaches outside the DeepMark token system.
//
// Excludes the five brand scale names we own (teal, success, warning, error,
// ink) — those *are* tokens. Excludes the neutral palette (slate, gray, zinc,
// neutral, stone) — allowed for true greyscale chrome where DeepMark has no
// equivalent.
//
// The regex matches the full utility (including optional dark:/hover:/focus:
// variants and opacity modifiers like `/30`) so the violation message can
// quote what the dev actually wrote.
const RAW_TW_COLOR_NAMES =
	"red|orange|amber|yellow|lime|green|emerald|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose"
const RAW_TW_PROPS =
	"bg|text|border|ring|fill|stroke|outline|decoration|caret|divide|placeholder|accent|from|via|to"
const RAW_TAILWIND_COLOR_RE = new RegExp(
	String.raw`\b(${RAW_TW_PROPS})-(${RAW_TW_COLOR_NAMES})-\d{1,3}(/\d+)?\b`,
	"g",
)

// Maps the bare class (without dark:/hover:/opacity) to a suggested
// replacement. `text-green-700` → "text-success-700 (or <StatusIcon kind=
// 'success' />)". When a class isn't listed, the fallback message points at
// the lookup table in CLAUDE.md.
const TW_REPLACEMENTS: Record<string, string> = {
	// Greens → success
	"bg-green-50": "bg-success-50",
	"bg-green-100": 'bg-success-100 (or <SoftChip kind="success" />)',
	"bg-green-200": "bg-success-200",
	"bg-green-300": "bg-success-300",
	"bg-green-400": "bg-success-400",
	"bg-green-500": 'bg-success-500 (or <StatusDot kind="success" />)',
	"bg-green-600": "bg-success-600",
	"bg-green-700": "bg-success-700",
	"bg-green-800": "bg-success-800",
	"bg-green-900": "bg-success-900",
	"bg-green-950": "bg-success-950",
	"text-green-500":
		'text-success-500 (or <StatusIcon kind="success" /> for icons)',
	"text-green-600": "text-success-600",
	"text-green-700": "text-success-700",
	"text-green-800": "text-success-800",
	"border-green-200": "border-success-200",
	"border-green-300": "border-success-300",
	"border-green-400": "border-success-400",
	"border-green-500": "border-success-500",
	"border-green-600": "border-success-600",
	// Emerald → success (no separate emerald token)
	"bg-emerald-500": "bg-success-500",
	"text-emerald-500": "text-success-500",
	"border-emerald-500": "border-success-500",
	// Ambers → warning
	"bg-amber-50": "bg-warning-50",
	"bg-amber-100": 'bg-warning-100 (or <SoftChip kind="warning" />)',
	"bg-amber-200": "bg-warning-200",
	"bg-amber-300": "bg-warning-300",
	"bg-amber-400": "bg-warning-400",
	"bg-amber-500": 'bg-warning-500 (or <StatusDot kind="warning" />)',
	"bg-amber-600": "bg-warning-600",
	"text-amber-500": "text-warning-500",
	"text-amber-700": "text-warning-700",
	"text-amber-800": "text-warning-800",
	"border-amber-200": "border-warning-200",
	"border-amber-300": "border-warning-300",
	"border-amber-400": "border-warning-400",
	// Oranges → warning
	"bg-orange-400": "bg-warning-400",
	"bg-orange-500": "bg-warning-500",
	// Reds → error / destructive
	"bg-red-50": "bg-error-50",
	"bg-red-100": 'bg-error-100 (or <SoftChip kind="error" />)',
	"bg-red-500": "bg-error-500 (or bg-destructive for destructive UI signals)",
	"bg-red-600": "bg-error-600",
	"text-red-500": "text-error-500 (or text-destructive)",
	"text-red-700": "text-error-700",
	"text-red-800": "text-error-800",
	"border-red-200": "border-error-200",
	"border-red-300": "border-error-300",
	"border-red-400": "border-error-400",
	"border-red-500": "border-error-500",
	// Cyans / blues → teal (DeepMark accent — never Tailwind cyan/blue)
	"bg-cyan-500": "bg-teal-500",
	"bg-blue-500": "bg-teal-500 (or bg-primary for the brand CTA)",
	"text-blue-500": "text-teal-500 (or text-primary)",
	"text-blue-700": "text-teal-700",
}

function suggestionForTailwind(matched: string): string {
	// Strip dark:/hover:/focus: variant prefixes when looking up the
	// replacement so `dark:bg-green-500` maps to the same row as `bg-green-500`.
	const bare = matched.replace(/^([a-z-]+:)+/, "").replace(/\/\d+$/, "")
	const exact = TW_REPLACEMENTS[bare]
	if (exact) return exact
	return "use a DeepMark token from globals.tokens.css — see CLAUDE.md → Colour lookup table"
}

const SUGGESTIONS: Record<string, string> = {
	"#01add0": "bg-primary / text-primary / border-primary (DeepMark accent)",
	"#0190ae": "hover:bg-teal-dark",
	"#1a1a1a": "text-foreground / bg-foreground (DeepMark ink)",
	"#e8e6e0": "bg-background (DeepMark page)",
	"#f5f4f0": "bg-muted (DeepMark surface)",
	"#ffffff": "bg-card (DeepMark white tile)",
	"#fff": "bg-card",
	"#c23b3b": "text-destructive / bg-destructive",
}

function suggestionFor(matched: string): string {
	const lower = matched.toLowerCase()
	for (const [hex, suggestion] of Object.entries(SUGGESTIONS)) {
		if (lower.includes(hex)) return ` (try ${suggestion})`
	}
	return ""
}

export function checkSourceFile(
	relPath: string,
	contents: string,
): Violation[] {
	if (isAllowedPath(relPath)) return []
	const violations: Violation[] = []
	const lines = contents.split("\n")
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] ?? ""

		for (const match of line.matchAll(ARBITRARY_HEX_RE)) {
			violations.push({
				file: relPath,
				line: i + 1,
				rule: "no-hex-arbitrary-value",
				matched: match[0],
				message: `Tailwind arbitrary value with raw colour literal: ${match[0]}.${suggestionFor(match[0])} Reference a token via \`bg-primary\`, \`text-foreground\`, etc., or add a token to globals.css.`,
			})
		}

		for (const match of line.matchAll(HEX_STRING_RE)) {
			violations.push({
				file: relPath,
				line: i + 1,
				rule: "no-hex-string-literal",
				matched: match[0],
				message: `Hex colour string literal: ${match[0]}.${suggestionFor(match[2] ?? "")} Use a CSS variable from globals.css (read via \`var(--name)\` in CSS or \`getComputedStyle\` in JS).`,
			})
		}

		for (const match of line.matchAll(RAW_TAILWIND_COLOR_RE)) {
			violations.push({
				file: relPath,
				line: i + 1,
				rule: "no-raw-tailwind-color",
				matched: match[0],
				message: `Raw Tailwind colour utility \`${match[0]}\` — try ${suggestionForTailwind(match[0])}.`,
			})
		}
	}
	return violations
}

function isCheckable(rel: string): boolean {
	if (!rel.startsWith("src/")) return false
	if (!rel.endsWith(".ts") && !rel.endsWith(".tsx")) return false
	if (rel.includes("/__tests__/")) return false
	if (rel.endsWith(".test.ts") || rel.endsWith(".test.tsx")) return false
	if (rel.includes("/.next/") || rel.includes("/node_modules/")) return false
	return true
}

function* walk(root: string, base: string): Generator<string> {
	for (const entry of fs.readdirSync(path.join(root, base), {
		withFileTypes: true,
	})) {
		const rel = path.join(base, entry.name)
		if (entry.isDirectory()) {
			yield* walk(root, rel)
		} else {
			yield rel
		}
	}
}

export function checkProject(projectRoot: string): Violation[] {
	const violations: Violation[] = []
	for (const rel of walk(projectRoot, "src")) {
		if (!isCheckable(rel)) continue
		const full = path.join(projectRoot, rel)
		const contents = fs.readFileSync(full, "utf8")
		violations.push(...checkSourceFile(rel, contents))
	}
	return violations
}

if (import.meta.main) {
	const root = process.cwd()
	const violations = checkProject(root)
	if (violations.length === 0) {
		console.log("✓ No hex colour literals found outside allowlisted files")
		process.exit(0)
	}
	console.error(
		`Found ${violations.length} design-token violation(s):\nEvery colour must come from a CSS variable defined in globals.css.\nSee geoff_ui_claude_design/v2/deepmark_design_system.html for the spec.\n`,
	)
	for (const v of violations) {
		console.error(`  ${v.file}:${v.line}  [${v.rule}]  ${v.message}`)
	}
	process.exit(1)
}
