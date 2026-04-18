import { Extension } from "@tiptap/core"
import { Plugin } from "@tiptap/pm/state"
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
 * Makes the editor text immutable while still allowing:
 * - Text selection
 * - Mark toggling (tick, cross, underline, etc.)
 * - Undo/redo of mark changes
 * - Programmatic stage-sync updates tagged with BYPASS_READ_ONLY meta
 *
 * Works by filtering transactions: any transaction containing a ReplaceStep
 * or ReplaceAroundStep (which change text content) is rejected unless the
 * BYPASS_READ_ONLY meta is set. AddMarkStep and RemoveMarkStep always pass
 * through.
 */
export const ReadOnlyText = Extension.create({
	name: "readOnlyText",

	addProseMirrorPlugins() {
		return [
			new Plugin({
				filterTransaction(tr) {
					if (!tr.docChanged) return true
					if (tr.getMeta(BYPASS_READ_ONLY)) return true

					for (const step of tr.steps) {
						if (
							step instanceof ReplaceStep ||
							step instanceof ReplaceAroundStep
						) {
							return false
						}
					}
					return true
				},
			}),
		]
	},
})
