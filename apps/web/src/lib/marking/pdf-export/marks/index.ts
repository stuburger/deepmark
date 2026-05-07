import {
	type TextMark,
	type TextSegment,
	alignTokensToAnswer,
	deriveTextMarks,
} from "@mcp-gcse/shared"
import { aoHex, aoLabel } from "../../ao-palette"
import type {
	GradingResult,
	PageToken,
	StudentPaperAnnotation,
} from "../../types"

/**
 * Pure mark/segment-derivation helpers shared by the (legacy) @react-pdf
 * exporter and the (current) HTML/Puppeteer exporter. Lives outside both
 * renderers so neither imports the other's React primitives.
 */

// ── Colour maps ────────────────────────────────────────────────────────

export const MARK_COLOURS: Record<string, string> = {
	tick: "#16A34A",
	cross: "#DC2626",
	underline: "#3B82F6",
	double_underline: "#166534",
	box: "#9333EA",
	circle: "#D97706",
}

export const CHAIN_BG: Record<string, string> = {
	reasoning: "#DBEAFE",
	evaluation: "#FEF3C7",
	judgement: "#EDE9FE",
}

const CIRCLE_HIGHLIGHT_BG = "#FEF3C7"

// ── marksForQuestion ──────────────────────────────────────────────────

/**
 * Aligns the student answer text to its OCR tokens and projects the
 * structured annotations onto character ranges in `student_answer`.
 * Returns an empty array for deterministic / unaligned questions.
 */
export function marksForQuestion(
	result: GradingResult,
	annotations: StudentPaperAnnotation[],
	pageTokens: PageToken[],
): TextMark[] {
	if (result.marking_method === "deterministic") return []
	const qTokens = pageTokens.filter((t) => t.question_id === result.question_id)
	if (qTokens.length === 0) return []
	const alignment = alignTokensToAnswer(result.student_answer, qTokens)
	if (Object.keys(alignment.tokenMap).length === 0) return []
	const qAnnotations = annotations.filter(
		(a) => a.question_id === result.question_id,
	)
	if (qAnnotations.length === 0) return []
	return deriveTextMarks(qAnnotations, alignment)
}

// ── Segment style ──────────────────────────────────────────────────────

/**
 * The answer text itself stays black — readability comes first. The mark
 * signals attach via *decorations* (coloured underline, background fill,
 * outline, leading +/× glyph, trailing AO badge) so a teacher can scan
 * for examiner activity without losing the answer.
 */
export type SegmentStyle = {
	/** Coloured underline (drawn under black text) for underline / double_underline. */
	textDecoration?: "underline" | "underline double"
	textDecorationColor?: string
	/** Soft fill behind the segment for circle / chain marks. */
	backgroundColor?: string
	/** Outline ring for box marks (the closest non-colour-shifting analogue
	 *  to "draw a rectangle around the word"). */
	outline?: string
	/** "+" or "×" prefix before the segment, coloured by tick / cross. */
	leadingSymbol?: "+" | "x" | null
	/** AO badges suffixed after the segment text. */
	trailingAoLabels: { label: string; colour: string }[]
}

export function deriveSegmentStyle(seg: TextSegment): SegmentStyle {
	let textDecoration: SegmentStyle["textDecoration"]
	let textDecorationColor: string | undefined
	let backgroundColor: string | undefined
	let outline: string | undefined
	let leadingSymbol: "+" | "x" | null = null
	const trailingAoLabels: { label: string; colour: string }[] = []

	for (const m of seg.marks) {
		if (m.type === "underline") {
			textDecoration = "underline"
			textDecorationColor = MARK_COLOURS.underline
		}
		if (m.type === "double_underline") {
			textDecoration = "underline double"
			textDecorationColor = MARK_COLOURS.double_underline
		}
		if (m.type === "circle") {
			backgroundColor = CIRCLE_HIGHLIGHT_BG
		}
		if (m.type === "chain") {
			const ct = (m.attrs.chainType as string | undefined) ?? "reasoning"
			backgroundColor = CHAIN_BG[ct] ?? CHAIN_BG.reasoning
		}
		if (m.type === "box") {
			outline = `0.75pt solid ${MARK_COLOURS.box}`
		}
		if (m.type === "tick") leadingSymbol = "+"
		if (m.type === "cross") leadingSymbol = "x"

		if (m.attrs.ao_category) {
			const label = aoLabel(m.attrs as Record<string, unknown>)
			const colour = aoHex(label)
			if (!trailingAoLabels.some((t) => t.label === label)) {
				trailingAoLabels.push({ label, colour })
			}
		}
	}

	return {
		textDecoration,
		textDecorationColor,
		backgroundColor,
		outline,
		leadingSymbol,
		trailingAoLabels,
	}
}

// ── Line splitting ─────────────────────────────────────────────────────

/**
 * Splits the answer text on `\n` into per-line entries, preserving the
 * absolute character offsets (start/end) so segments derived per line
 * still align to the source text.
 */
export function splitIntoLines(
	text: string,
): Array<{ text: string; start: number; end: number }> {
	const lines: Array<{ text: string; start: number; end: number }> = []
	let cursor = 0
	for (const line of text.split("\n")) {
		const start = cursor
		const end = cursor + line.length
		lines.push({ text: line, start, end })
		cursor = end + 1 // account for the consumed "\n"
	}
	return lines
}

/**
 * Clips a list of text marks to the [lineStart, lineEnd) range and
 * re-bases their offsets to be local to that line. Marks fully outside
 * the range are dropped; marks that straddle the range are clipped.
 */
export function clipMarksToLine(
	marks: TextMark[],
	lineStart: number,
	lineEnd: number,
): TextMark[] {
	const out: TextMark[] = []
	for (const m of marks) {
		const from = Math.max(m.from, lineStart)
		const to = Math.min(m.to, lineEnd)
		if (from >= to) continue
		out.push({ ...m, from: from - lineStart, to: to - lineStart })
	}
	return out
}
