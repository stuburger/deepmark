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
	rule: "no-hex-arbitrary-value" | "no-hex-string-literal"
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
	// Bounding-box overlays for the scan viewer. Drawn directly on canvas.
	// TODO(phase-5): migrate to read --mark-* CSS vars via getComputedStyle so
	// these match the editor's annotation marks.
	"src/components/BoundingBoxViewer.tsx",
	"src/components/BoundingBoxViewer/mark-overlay.tsx",
	"src/components/BoundingBoxViewer/chain-overlay.tsx",
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
	// PDF export via @react-pdf/renderer runs outside the browser — CSS
	// variables don't apply, so all colours must be raw hex. The PDF subtree
	// is a separate rendering target.
	"src/lib/marking/pdf-export/",
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
const ARBITRARY_HEX_RE = /\[[^\]]*(?:#[0-9a-fA-F]{3,8}|rgba?\([^\]]+\))[^\]]*\]/g

// Hex string literal: a 3-, 4-, 6-, or 8-digit hex prefixed with `#` inside a
// single- or double-quoted string. Excludes longer runs (e.g. `#abcdef0123`)
// and template strings.
const HEX_STRING_RE = /(["'])(#[0-9a-fA-F]{3,8})\1/g

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
		`Found ${violations.length} design-token violation(s):\n` +
			"Every colour must come from a CSS variable defined in globals.css.\n" +
			"See geoff_ui_claude_design/v2/deepmark_design_system.html for the spec.\n",
	)
	for (const v of violations) {
		console.error(`  ${v.file}:${v.line}  [${v.rule}]  ${v.message}`)
	}
	process.exit(1)
}
