import type { Node as PmNode, ResolvedPos } from "@tiptap/pm/model"

export type AnswerCharPos = {
	questionId: string
	/** Char offset within the question block's `textContent`. */
	char: number
}

/**
 * Walk a resolved PM position's ancestors and return the enclosing
 * `questionAnswer` block (the node + its depth), or null when the
 * position isn't inside one. Used by:
 *  - the Enter / Shift-Enter shortcut on `QuestionAnswerNode` (only
 *    intercept the keystroke when the cursor is inside an answer block);
 *  - the bubble-menu "Talk to DeepMark" trigger (read the questionNumber
 *    off the attrs to label the chat context chip).
 *
 * Returns the node + depth instead of just an attr so callers can pick
 * whichever attr they need. The two call sites previously inlined the
 * same depth-walk loop; this keeps a single source of truth for "which
 * question am I in?"
 */
export function findEnclosingQuestionAnswer(
	$pos: ResolvedPos,
): { node: PmNode; depth: number } | null {
	for (let depth = $pos.depth; depth > 0; depth--) {
		const node = $pos.node(depth)
		if (node.type.name === "questionAnswer") return { node, depth }
	}
	return null
}

/**
 * Convert a PM position into a char offset inside a *known* question
 * block's `textContent`. Returns null when `pos` lies outside the block.
 *
 * Why this is non-trivial: PM positions count every node boundary, not
 * just text characters. `textContent` skips non-text inline nodes
 * (HardBreak, atoms). The token alignment we resolve against is computed
 * over `node.textContent`, so positions on either side of a HardBreak
 * must map to the SAME char index — a naive `pos - blockStart` drifts by
 * 1 per HardBreak encountered along the way.
 *
 * Algorithm: walk the block's children once, advancing a PM cursor and a
 * parallel char cursor. Text children contribute their text length;
 * non-text inline nodes (HardBreak) contribute 0 chars but still consume
 * PM positions. We stop the moment the PM cursor reaches `pos`.
 *
 * Exported separately from `pmPosToAnswerChar` so callers that already
 * know which block they're in (e.g. `resolveTokensForRange` walking
 * blocks via descendants) can skip the redundant doc-root resolve.
 */
export function pmPosToCharInBlock(
	block: PmNode,
	blockStart: number,
	pos: number,
): number | null {
	const blockEnd = blockStart + block.content.size
	if (pos < blockStart || pos > blockEnd) return null

	let pmCursor = blockStart
	let charCursor = 0
	for (let i = 0; i < block.childCount; i++) {
		const child = block.child(i)
		const childPmEnd = pmCursor + child.nodeSize
		if (pos < childPmEnd) {
			if (child.isText) {
				// `pos - pmCursor` is the char offset within this text node's
				// content. Clamp defensively against pathological inputs.
				const within = Math.max(
					0,
					Math.min(child.text?.length ?? 0, pos - pmCursor),
				)
				return charCursor + within
			}
			// Non-text inline node (HardBreak / inline atom). Positions
			// landing inside its open/close boundary map to the current
			// char cursor — the node contributes 0 chars to textContent.
			return charCursor
		}
		if (child.isText) charCursor += child.text?.length ?? 0
		pmCursor = childPmEnd
	}
	// `pos` reached the trailing edge of the block.
	return charCursor
}

/**
 * Convert a ProseMirror position into a char offset inside the containing
 * `questionAnswer` block's `textContent`. Returns null when the position
 * isn't inside any question block (e.g. the leading examiner-summary
 * paragraph, or an mcqTable atom).
 *
 * Implemented as the doc-rooted entry point — resolves the position,
 * walks up to find the enclosing question block, then delegates to
 * `pmPosToCharInBlock`. Use that helper directly when you already have
 * the block in hand to avoid a redundant resolve.
 */
export function pmPosToAnswerChar(
	doc: PmNode,
	pos: number,
): AnswerCharPos | null {
	if (pos < 0 || pos > doc.content.size) return null
	const $pos = doc.resolve(pos)

	for (let depth = $pos.depth; depth >= 0; depth--) {
		const block = $pos.node(depth)
		if (block.type.name !== "questionAnswer") continue
		const questionId = block.attrs.questionId as string | null
		if (!questionId) return null

		const char = pmPosToCharInBlock(block, $pos.start(depth), pos)
		if (char === null) return null
		return { questionId, char }
	}
	return null
}
