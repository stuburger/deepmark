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
 *
 * To override an individual shade, add an explicit value to tokens.json under
 * `color.<scale>-<shade>` (e.g. `color.success-100`) — the generator prefers
 * the explicit value when present.
 */
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { type Oklch, formatHex, oklch } from "culori"

const __dirname = dirname(fileURLToPath(import.meta.url))

const TOKENS_PATH = resolve(
	__dirname,
	"../../../geoff_ui_claude_design/v2/deepmark_tokens.json",
)
const OUTPUT_PATH = resolve(__dirname, "../src/app/globals.tokens.css")

const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const

// Lightness curve calibrated to match Tailwind v4's own scales (oklch L values).
// Anchors override the value for whichever shade they sit at.
const L_CURVE: Record<number, number> = {
	50: 0.985,
	100: 0.967,
	200: 0.928,
	300: 0.87,
	400: 0.745,
	500: 0.62,
	600: 0.53,
	700: 0.45,
	800: 0.38,
	900: 0.29,
	950: 0.205,
}

type ScaleSpec = {
	name: string
	anchorHex: string
	anchorAt: number // which shade the anchor sits at (500 for most, 950 for ink)
	overrides?: Partial<Record<number, string>>
}

// Chroma drops at the extremes (very light / very dark) to match Tailwind v4's
// behaviour — at L=0.985 a high chroma reads neon, so we taper.
function scaleChroma(baseChroma: number, l: number): number {
	if (l > 0.95) return baseChroma * 0.3
	if (l > 0.85) return baseChroma * 0.6
	if (l < 0.25) return baseChroma * 0.7
	return baseChroma
}

function generateScale({
	name,
	anchorHex,
	anchorAt,
	overrides,
}: ScaleSpec): string {
	const anchor = oklch(anchorHex) as Oklch | undefined
	if (!anchor)
		throw new Error(`Could not parse anchor for ${name}: ${anchorHex}`)

	const lines: string[] = [
		`\t/* ${name.toUpperCase()} — anchor: ${name}-${anchorAt} = ${anchorHex.toUpperCase()} */`,
	]

	for (const shade of SHADES) {
		const explicit = overrides?.[shade]
		let hex: string
		if (explicit) {
			hex = explicit.toLowerCase()
		} else if (shade === anchorAt) {
			hex = anchorHex.toLowerCase()
		} else {
			const l = L_CURVE[shade] ?? 0.5
			const c = scaleChroma(anchor.c ?? 0, l)
			const h = anchor.h ?? 0
			const formatted = formatHex({ mode: "oklch", l, c, h })
			if (!formatted) throw new Error(`Failed to format shade ${name}-${shade}`)
			hex = formatted.toLowerCase()
		}
		lines.push(`\t--color-${name}-${shade}: ${hex};`)
	}

	return lines.join("\n")
}

type TokensFile = {
	color: Record<string, { value: string }>
}

const tokens = JSON.parse(readFileSync(TOKENS_PATH, "utf8")) as TokensFile

function anchor(key: string): string {
	const entry = tokens.color[key]
	if (!entry) throw new Error(`Missing color.${key} in tokens.json`)
	return entry.value
}

// Optional per-shade overrides: tokens.json may define e.g. `color.success-100`.
function overridesFor(name: string): Partial<Record<number, string>> {
	const out: Partial<Record<number, string>> = {}
	for (const shade of SHADES) {
		const entry = tokens.color[`${name}-${shade}`]
		if (entry) out[shade] = entry.value
	}
	return out
}

const scales: ScaleSpec[] = [
	{
		name: "teal",
		anchorHex: anchor("accent"),
		anchorAt: 500,
		overrides: overridesFor("teal"),
	},
	{
		name: "success",
		anchorHex: anchor("success"),
		anchorAt: 500,
		overrides: overridesFor("success"),
	},
	{
		name: "warning",
		anchorHex: anchor("warning"),
		anchorAt: 500,
		overrides: overridesFor("warning"),
	},
	{
		name: "error",
		anchorHex: anchor("error"),
		anchorAt: 500,
		overrides: overridesFor("error"),
	},
	{
		name: "ink",
		anchorHex: anchor("ink"),
		anchorAt: 950,
		overrides: overridesFor("ink"),
	},
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
 * To override a single derived shade, add e.g. \`color.success-100\` to
 * tokens.json — the generator prefers explicit values over derivation.
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
