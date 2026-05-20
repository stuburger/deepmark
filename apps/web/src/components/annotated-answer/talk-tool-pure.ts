/**
 * Pure helpers for the Talk to DeepMark tool dispatcher — no editor /
 * transaction side effects. Doc reads + offset arithmetic + attr shaping
 * only. Tested directly with vitest (no DOM, no TipTap mount).
 *
 * Editor-mutating helpers (applyAnnotationByPhrase, updateAnnotationById,
 * removeAnnotationById) live in `talk-tool-actions.ts` and consume the
 * pure helpers below.
 */

import type { AddAnnotationInput } from "@/lib/talk/tools"
import type { Mark, Node as PmNode } from "@tiptap/pm/model"

export type ApplyAnnotationResult =
	| { ok: true; annotationId: string }
	| { ok: false; reason: string }

export type UpdateAnnotationResult =
	| { ok: true }
	| { ok: false; reason: string }

export type RemoveAnnotationResult = UpdateAnnotationResult

/** Sentiment derived from the API-facing signal. Mirrors MARK_ACTIONS. */
export function sentimentForSignal(
	signal: AddAnnotationInput["signal"],
): string {
	switch (signal) {
		case "cross":
		case "circle":
			return "negative"
		default:
			return "positive"
	}
}

/**
 * Find the `questionAnswer` block in the doc with a matching `questionId`
 * attr. Returns the node plus its inner content positions, or null when no
 * block matches.
 */
export function findQuestionBlock(
	doc: PmNode,
	questionId: string,
): { node: PmNode; blockStart: number; blockEnd: number } | null {
	let found: {
		node: PmNode
		blockStart: number
		blockEnd: number
	} | null = null
	doc.descendants((node, pos) => {
		if (found) return false
		if (node.type.name !== "questionAnswer") return undefined
		if (node.attrs.questionId === questionId) {
			found = {
				node,
				blockStart: pos + 1,
				blockEnd: pos + node.nodeSize - 1,
			}
			return false
		}
		return undefined
	})
	return found
}

/**
 * Inverse of `pmPosToCharInBlock` — char offset within a question block's
 * `textContent` → PM position. Walks the block's children once, counting
 * text-node lengths and consuming non-text inline nodes (HardBreak) at 0
 * chars to match `textContent` semantics.
 *
 * Returns null when `char` exceeds the block's textContent length (caller
 * typically rejects with a "phrase past end of answer" reason).
 */
export function charToPmPosInBlock(
	block: PmNode,
	blockStart: number,
	char: number,
): number | null {
	if (char < 0) return null
	let pmCursor = blockStart
	let charCursor = 0
	for (let i = 0; i < block.childCount; i++) {
		const child = block.child(i)
		if (child.isText) {
			const len = child.text?.length ?? 0
			if (char <= charCursor + len) {
				return pmCursor + (char - charCursor)
			}
			pmCursor += child.nodeSize
			charCursor += len
		} else {
			// 0-char inline node (HardBreak / atom). Skip without advancing
			// `charCursor` — matches the existing `pmPosToCharInBlock` model
			// where these contribute 0 chars to `textContent`.
			pmCursor += child.nodeSize
		}
	}
	// `char` reached the trailing edge of the block.
	if (char === charCursor) return pmCursor
	return null
}

/**
 * Linearise a question block's text with explicit "\n" at HardBreak
 * positions. The phrase search uses this (not `node.textContent`) so the
 * model can quote across line breaks — `textContent` strips HardBreaks
 * and joins surrounding text directly, which silently broke any phrase
 * that crossed a line.
 *
 * Pairs with `charToPmPosInBlockWithBreaks` — same break = 1 char model
 * so `text.indexOf(phrase)` and the char→PM mapping agree.
 */
export function buildBlockTextWithBreaks(block: PmNode): string {
	let out = ""
	for (let i = 0; i < block.childCount; i++) {
		const child = block.child(i)
		if (child.isText) {
			out += child.text ?? ""
		} else if (child.type.name === "hardBreak") {
			out += "\n"
		}
		// Other non-text inline nodes contribute 0 chars (matches the
		// existing 0-char-for-atoms model on `textContent`).
	}
	return out
}

/**
 * Char offset → PM position, using the "HardBreak = 1 char" model that
 * pairs with `buildBlockTextWithBreaks`. Use this when the char index
 * came from a search over the with-breaks text; the plain
 * `charToPmPosInBlock` is for char indices derived from
 * `node.textContent`.
 */
export function charToPmPosInBlockWithBreaks(
	block: PmNode,
	blockStart: number,
	char: number,
): number | null {
	if (char < 0) return null
	let pmCursor = blockStart
	let charCursor = 0
	for (let i = 0; i < block.childCount; i++) {
		const child = block.child(i)
		if (child.isText) {
			const len = child.text?.length ?? 0
			if (char <= charCursor + len) {
				return pmCursor + (char - charCursor)
			}
			pmCursor += child.nodeSize
			charCursor += len
		} else if (child.type.name === "hardBreak") {
			// HardBreak consumes 1 char in the linearised text. If the
			// target sits AT the break boundary, return the PM cursor
			// before consuming it (the mark should not extend into the
			// HardBreak atom).
			if (char === charCursor) return pmCursor
			pmCursor += child.nodeSize
			charCursor += 1
		} else {
			// Other inline nodes — 0 chars
			pmCursor += child.nodeSize
		}
	}
	if (char === charCursor) return pmCursor
	return null
}

/**
 * Find an existing annotation mark by `annotationId` across the whole doc.
 * Returns the spanning PM range and the original Mark instance, or null if
 * no text node carries a mark with this id.
 *
 * A single annotation can span multiple adjacent text nodes (whenever
 * another mark — bold, italic — breaks the run); the returned range covers
 * from the FIRST text node's start to the LAST text node's end so we can
 * remove/replace the mark in one transaction.
 */
export function findAnnotationRange(
	doc: PmNode,
	annotationId: string,
): { from: number; to: number; mark: Mark } | null {
	let from = -1
	let to = -1
	let foundMark: Mark | null = null
	doc.descendants((node, pos) => {
		if (!node.isText) return undefined
		for (const m of node.marks) {
			if (m.attrs.annotationId === annotationId) {
				if (from === -1) from = pos
				to = pos + node.nodeSize
				foundMark = m
			}
		}
		return undefined
	})
	if (from === -1 || foundMark === null) return null
	return { from, to, mark: foundMark }
}

/** Build the attrs object for a new annotation mark from tool input. */
export function attrsForNewMark(
	input: AddAnnotationInput,
): Record<string, unknown> {
	const annotationId = crypto.randomUUID()
	return {
		annotationId,
		// DeepMark-applied marks are tagged "teacher" — DeepMark is the
		// teacher's hand, conversationally. This matches what
		// `applyAnnotationMark` (the toolbar / shortcut path) does so the
		// projection Lambda treats both the same.
		source: "teacher",
		sentiment: sentimentForSignal(input.signal),
		reason: input.reason,
		comment: input.comment ?? null,
		ao_category: input.ao_category ?? null,
		ao_display: input.ao_display ?? null,
		ao_quality: input.ao_quality ?? null,
	}
}

export function truncate(s: string, max = 60): string {
	return s.length > max ? `${s.slice(0, max)}…` : s
}
