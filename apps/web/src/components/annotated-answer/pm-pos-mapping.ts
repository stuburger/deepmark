import type { Node as PmNode } from "@tiptap/pm/model"

export type AnswerCharPos = {
	questionId: string
	/** Char offset within the question block's `textContent`. */
	char: number
}

/**
 * Convert a ProseMirror position into a char offset inside the containing
 * `questionAnswer` block's `textContent`. Returns null when the position
 * isn't inside any question block (e.g. the leading examiner-summary
 * paragraph, or an mcqTable atom).
 *
 * Why this is non-trivial: PM positions count every node boundary, not
 * just text characters. `textContent` skips non-text inline nodes
 * (HardBreak, atoms). The token alignment we resolve against is computed
 * over `node.textContent`, so positions on either side of a HardBreak
 * must map to the SAME char index — a naive `pos - blockStart` drifts by
 * 1 per HardBreak encountered along the way.
 *
 * Algorithm: walk the question block's children once, advancing a PM
 * cursor and a parallel char cursor. Text children contribute their text
 * length; non-text inline nodes (HardBreak) contribute 0 chars but still
 * consume PM positions. We stop the moment the PM cursor reaches `pos`.
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

		const blockStart = $pos.start(depth)
		let pmCursor = blockStart
		let charCursor = 0
		for (let i = 0; i < block.childCount; i++) {
			const child = block.child(i)
			const childPmEnd = pmCursor + child.nodeSize
			if (pos < childPmEnd) {
				if (child.isText) {
					// `pos - pmCursor` is the char offset within this text
					// node's content. Clamp defensively against pathological
					// inputs (out-of-range positions resolved into a text node).
					const within = Math.max(
						0,
						Math.min(child.text?.length ?? 0, pos - pmCursor),
					)
					return { questionId, char: charCursor + within }
				}
				// Non-text inline node (HardBreak / inline atom). Positions
				// landing inside its open/close boundary map to the current
				// char cursor — the node contributes 0 chars to textContent.
				return { questionId, char: charCursor }
			}
			if (child.isText) charCursor += child.text?.length ?? 0
			pmCursor = childPmEnd
		}

		// `pos` reached the trailing edge of the block.
		return { questionId, char: charCursor }
	}
	return null
}
