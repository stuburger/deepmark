import { Extension } from "@tiptap/core"
import { applyAnnotationMark } from "./apply-annotation-mark"
import { MARK_ACTIONS } from "./mark-actions"

type ShortcutOptions = {
	/** Mutable ref — called with the new annotationId after a mark is applied. */
	onMarkAppliedRef: { current: ((annotationId: string) => void) | undefined }
}

/**
 * Keyboard shortcuts for annotation marks.
 *
 * Bare number keys 1–7 toggle the corresponding mark when text is selected.
 * Marks snap to word boundaries and get a generated annotationId.
 * When nothing is selected the keys pass through to normal text input.
 */
export const AnnotationShortcuts = Extension.create<ShortcutOptions>({
	name: "annotationShortcuts",

	addKeyboardShortcuts() {
		const shortcuts: Record<string, () => boolean> = {}

		for (const action of MARK_ACTIONS) {
			shortcuts[action.key] = () => {
				const { from, to } = this.editor.state.selection
				if (from === to) return false

				const id = applyAnnotationMark(this.editor, action.name, action.attrs)
				if (id) {
					this.options.onMarkAppliedRef.current?.(id)
				}
				return true
			}
		}

		return shortcuts
	},
})
