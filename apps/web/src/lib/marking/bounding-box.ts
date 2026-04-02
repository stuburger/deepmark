import type { CSSProperties } from "react"

// ─── Types ─────────────────────────────────────────────────────────────────────

/** [yMin, xMin, yMax, xMax] normalised 0–1000 */
export type NormalisedBox = [number, number, number, number]

export type GradingAnnotation = {
	questionNumber: string
	questionText: string
	feedbackSummary: string
	awardedScore: number
	maxScore: number
	/** [yMin, xMin, yMax, xMax] normalised 0–1000 */
	box: NormalisedBox
	/** null = Vision hull, "gemini_fallback" = fallback-estimated region */
	source?: string | null
}

// ─── Constants ─────────────────────────────────────────────────────────────────

export const TOKEN_COLOR = "rgb(59 130 246)" // blue-500

// ─── Coordinate helpers ────────────────────────────────────────────────────────

/**
 * Converts a normalised [yMin, xMin, yMax, xMax] box (0–1000 scale) to
 * CSS percent-based absolute positioning properties.
 */
export function bboxToPercentStyle(box: NormalisedBox): CSSProperties {
	const [yMin, xMin, yMax, xMax] = box
	return {
		position: "absolute",
		left: `${xMin / 10}%`,
		top: `${yMin / 10}%`,
		width: `${(xMax - xMin) / 10}%`,
		height: `${(yMax - yMin) / 10}%`,
	}
}

export function rowLabel(y: number): string {
	if (y < 333) return "top"
	if (y < 667) return "middle"
	return "bottom"
}

export function colLabel(x: number): string {
	if (x < 333) return "left"
	if (x < 667) return "centre"
	return "right"
}

export function annotationColor(awarded: number, max: number): string {
	if (max === 0) return "rgb(156 163 175)"
	const pct = awarded / max
	if (pct >= 0.7) return "rgb(34 197 94)"
	if (pct >= 0.4) return "rgb(234 179 8)"
	return "rgb(239 68 68)"
}
