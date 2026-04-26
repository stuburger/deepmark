import { TIPTAP_TO_ENTRY } from "@mcp-gcse/shared"
import { type Editor, Extension } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"

const HIGHLIGHT_CLASS = "bg-blue-100/60 dark:bg-blue-400/20 transition-colors"

const hoverHighlightKey = new PluginKey("hoverHighlight")

type HoverHighlightOptions = {
	/** Mutable ref — called when cursor lands inside a mark (collapsed selection or doc change). */
	onAnnotationHoverRef: {
		current: ((annotationId: string | null) => void) | undefined
	}
}

/**
 * Tiptap extension for:
 * - Sidebar card activation based on cursor position
 * - Decoration highlights controlled externally via setAnnotationHighlight / setHoverHighlight
 */
export const HoverHighlightPlugin = Extension.create<HoverHighlightOptions>({
	name: "hoverHighlight",

	addProseMirrorPlugins() {
		const { onAnnotationHoverRef } = this.options

		return [
			new Plugin({
				key: hoverHighlightKey,

				state: {
					init() {
						return DecorationSet.empty
					},
					apply(tr, oldDecos) {
						let mapped = oldDecos
						if (tr.docChanged) {
							mapped = mapped.map(tr.mapping, tr.doc)
						}
						const meta = tr.getMeta(hoverHighlightKey)
						if (meta !== undefined) {
							return meta as DecorationSet
						}
						return mapped
					},
				},

				props: {
					decorations(state) {
						return hoverHighlightKey.getState(state)
					},
				},

				// PM → Sidebar: activate comment card when selection lands inside a mark.
				// Fires for both collapsed cursors and range selections (e.g. card click
				// sets a range selection), as well as doc changes (mark just applied).
				view() {
					return {
						update(view, prevState) {
							const onAnnotationHover = onAnnotationHoverRef.current
							if (!onAnnotationHover) return

							const docChanged = !prevState || view.state.doc !== prevState.doc
							const selChanged =
								!prevState || !view.state.selection.eq(prevState.selection)
							if (!docChanged && !selChanged) return

							const { from } = view.state.selection

							const $pos = view.state.doc.resolve(from)
							const marks = $pos.marks()

							let foundAnnotation: string | null = null
							for (const mark of marks) {
								if (!TIPTAP_TO_ENTRY.has(mark.type.name)) continue
								const id = mark.attrs.annotationId as string | null
								if (id) {
									foundAnnotation = id
									break
								}
							}

							onAnnotationHover(foundAnnotation)
						},
					}
				},
			}),
		]
	},
})

// ─── Helpers to set highlights from outside ─────────────────────────────────

export function setAnnotationHighlight(
	editor: Editor,
	annotationId: string | null,
): void {
	const { view } = editor
	const { doc, tr } = view.state

	if (!annotationId) {
		view.dispatch(tr.setMeta(hoverHighlightKey, DecorationSet.empty))
		return
	}

	const decos: Decoration[] = []

	doc.descendants((node, pos) => {
		if (node.type.name !== "questionAnswer") return

		node.forEach((child, childOffset) => {
			if (!child.isText || !child.marks.length) return

			for (const mark of child.marks) {
				if (!TIPTAP_TO_ENTRY.has(mark.type.name)) continue
				const id = mark.attrs.annotationId as string | null
				if (id !== annotationId) continue

				const from = pos + 1 + childOffset
				const to = from + child.nodeSize
				decos.push(Decoration.inline(from, to, { class: HIGHLIGHT_CLASS }))
			}
		})
	})

	view.dispatch(
		tr.setMeta(
			hoverHighlightKey,
			decos.length > 0 ? DecorationSet.create(doc, decos) : DecorationSet.empty,
		),
	)
}
