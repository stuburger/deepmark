import { Extension } from "@tiptap/core"
import { Plugin } from "@tiptap/pm/state"
import { ReplaceAroundStep, ReplaceStep } from "@tiptap/pm/transform"

/**
 * Makes the editor text immutable while still allowing:
 * - Text selection
 * - Mark toggling (tick, cross, underline, etc.)
 * - Undo/redo of mark changes
 *
 * Works by filtering transactions: any transaction containing a ReplaceStep
 * or ReplaceAroundStep (which change text content) is rejected. AddMarkStep
 * and RemoveMarkStep pass through.
 */
export const ReadOnlyText = Extension.create({
	name: "readOnlyText",

	addProseMirrorPlugins() {
		return [
			new Plugin({
				filterTransaction(tr) {
					if (!tr.docChanged) return true

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
