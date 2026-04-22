/**
 * Single source of truth for AO (Assessment Objective) category colours.
 *
 * Each AO has a colour expressed in two formats for different rendering
 * contexts: hex (SVG overlays + @react-pdf) and className (Tailwind).
 */

type AoPaletteEntry = {
	hex: string
	/** Tailwind classes for bordered pill badges (e.g. annotation answer view) */
	pillClass: string
	/** Tailwind classes for filled pill badges (e.g. legend, popover) */
	legendClass: string
}

const AO_PALETTE: Record<string, AoPaletteEntry> = {
	AO1: {
		hex: "#3b82f6",
		pillClass:
			"border-blue-400 text-blue-600 bg-blue-50 dark:border-blue-500 dark:text-blue-400 dark:bg-blue-950/40",
		legendClass:
			"bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
	},
	AO2: {
		hex: "#ec4899",
		pillClass:
			"border-pink-400 text-pink-600 bg-pink-50 dark:border-pink-500 dark:text-pink-400 dark:bg-pink-950/40",
		legendClass:
			"bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
	},
	AO3: {
		hex: "#22c55e",
		pillClass:
			"border-green-400 text-green-600 bg-green-50 dark:border-green-500 dark:text-green-400 dark:bg-green-950/40",
		legendClass:
			"bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
	},
}

const FALLBACK: AoPaletteEntry = {
	hex: "#6b7280",
	pillClass:
		"border-zinc-300 text-zinc-600 bg-zinc-50 dark:border-zinc-500 dark:text-zinc-400 dark:bg-zinc-800/40",
	legendClass: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
}

/** Get the full palette entry for an AO category label. */
export function aoPalette(category: string): AoPaletteEntry {
	return AO_PALETTE[category] ?? FALLBACK
}

/** Get the hex colour for an AO category (SVG + @react-pdf rendering). */
export function aoHex(category: string): string {
	return (AO_PALETTE[category] ?? FALLBACK).hex
}

/** Get the Tailwind pill class for an AO category. */
export function aoPillClass(category: string): string {
	return (AO_PALETTE[category] ?? FALLBACK).pillClass
}

/** Get the Tailwind legend class for an AO category. */
export function aoLegendClass(category: string): string {
	return (AO_PALETTE[category] ?? FALLBACK).legendClass
}

/**
 * Resolve the display label for an AO annotation.
 * Prefers ao_display, falls back to ao_category, then "?".
 */
export function aoLabel(attrs: Record<string, unknown>): string {
	return (attrs.ao_display as string) ?? (attrs.ao_category as string) ?? "?"
}

/**
 * Tailwind classes for AO quality badges (strong/partial/incorrect).
 * This is a separate concept from category colours.
 */
export function aoQualityClass(quality: string | undefined): string {
	if (quality === "strong" || quality === "valid")
		return "text-green-700 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-950 dark:border-green-800"
	if (quality === "partial")
		return "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950 dark:border-amber-800"
	return "text-red-700 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950 dark:border-red-800"
}
