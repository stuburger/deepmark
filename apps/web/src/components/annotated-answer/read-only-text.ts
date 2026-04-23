import { Extension } from "@tiptap/core"
import type { EditorState } from "@tiptap/pm/state"
import { Plugin } from "@tiptap/pm/state"
import type { Transaction } from "@tiptap/pm/state"
import { ReplaceAroundStep, ReplaceStep } from "@tiptap/pm/transform"

/**
 * Transaction meta key that bypasses the read-only filter. Programmatic
 * stage-driven updates (setContent when new data flows in — tokens after
 * OCR, marks after enrichment) tag their transactions with this so the
 * filter lets them through. User typing never sets it, so typing stays
 * blocked.
 */
export const BYPASS_READ_ONLY = "readOnlyText$bypass"

/**
 * Returns true when the position `pos` in `doc` is inside an
 * `examinerSummary` node (at any ancestor depth).
 */
function isInsideExaminerSummary(state: EditorState, pos: number): boolean {
	try {
		const $pos = state.doc.resolve(pos)
		for (let d = $pos.depth; d >= 0; d--) {
			if ($pos.node(d).type.name === "examinerSummary") return true
		}
	} catch {
		// resolve() throws if pos is out of range — treat as not inside
	}
	return false
}

/**
 * Makes the editor text immutable while still allowing:
 * - Text selection
 * - Mark toggling (tick, cross, underline, etc.)
 * - Undo/redo of mark changes
 * - Programmatic stage-sync updates tagged with BYPASS_READ_ONLY meta
 * - Free editing inside `examinerSummary` nodes
 *
 * Works by filtering transactions: any transaction containing a ReplaceStep
 * or ReplaceAroundStep (which change text content) is rejected unless:
 *   a) the BYPASS_READ_ONLY meta is set, or
 *   b) every such step's affected range falls entirely within an
 *      `examinerSummary` node.
 *
 * AddMarkStep and RemoveMarkStep always pass through.
 */
export const ReadOnlyText = Extension.create({
	name: "readOnlyText",

	addProseMirrorPlugins() {
		return [
			new Plugin({
				filterTransaction(tr: Transaction, state: EditorState) {
					if (!tr.docChanged) return true
					if (tr.getMeta(BYPASS_READ_ONLY)) return true

					for (const step of tr.steps) {
						if (
							step instanceof ReplaceStep ||
							step instanceof ReplaceAroundStep
						) {
							// Allow the step only if it targets an examinerSummary node
							if (!isInsideExaminerSummary(state, step.from)) return false
						}
					}
					return true
				},
			}),
		]
	},
})
