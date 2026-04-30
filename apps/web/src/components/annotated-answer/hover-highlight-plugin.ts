import { TIPTAP_TO_ENTRY } from "@mcp-gcse/shared"
import { type Editor, Extension } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"

const ACTIVE_ANNOTATION_CLASS = "is-active-annotation"
const ACTIVE_CURSOR_CLASS = "is-annotation-cursor"

const hoverHighlightKey = new PluginKey("hoverHighlight")

type HoverHighlightOptions = {
	/** Mutable ref — called when cursor lands inside a mark (collapsed selection or doc change). */
	onActiveAnnotationChangeRef: {
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
		const { onActiveAnnotationChangeRef } = this.options

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
							const onActiveAnnotationChange =
								onActiveAnnotationChangeRef.current
							if (!onActiveAnnotationChange) return

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

							onActiveAnnotationChange(foundAnnotation)
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

	// Collect contiguous text-node ranges that share `annotationId` and emit
	// one decoration per range. Words inside an answer are split into multiple
	// text nodes by their per-word ocrToken marks, so a naive per-text-node
	// decoration would render N wrapping spans (and N "cursor" left-edges) for
	// an N-word annotation. Coalescing yields one wrapper per visually-
	// contiguous run, with breaks where a non-text node (hardBreak, embed)
	// genuinely splits the annotation.
	const ranges: Array<{ from: number; to: number }> = []
	let current: { from: number; to: number } | null = null

	const flush = () => {
		if (current) {
			ranges.push(current)
			current = null
		}
	}

	doc.descendants((node, pos) => {
		if (node.type.name !== "questionAnswer") return

		node.forEach((child, childOffset) => {
			if (!child.isText) {
				flush()
				return
			}

			const matches = child.marks.some(
				(m) =>
					TIPTAP_TO_ENTRY.has(m.type.name) &&
					(m.attrs.annotationId as string | null) === annotationId,
			)

			const from = pos + 1 + childOffset
			const to = from + child.nodeSize

			if (!matches) {
				flush()
				return
			}

			if (current && current.to === from) {
				current.to = to
			} else {
				flush()
				current = { from, to }
			}
		})

		flush()
	})

	flush()

	const decos: Decoration[] = ranges.map((r) =>
		Decoration.inline(r.from, r.to, { class: ACTIVE_ANNOTATION_CLASS }),
	)

	// "Un-blinking cursor" left edge — rendered as a 1-character inline
	// decoration at the leftmost position of the annotation, NOT as a CSS
	// `border-left` on `.is-active-annotation`. Even though `OcrTokenMark`
	// is set to `priority: 1` so annotation mark spans coalesce, PM's
	// inline decorations are a separate render layer that still splits at
	// every mark transition (i.e. per word, because each word carries a
	// distinct ocrToken mark). A border on the full-range class would
	// therefore repeat on every word. By scoping this decoration to a
	// single character, the wrapping span only ever lands on the leftmost
	// glyph of the leftmost range.
	if (ranges.length > 0) {
		decos.unshift(
			Decoration.inline(ranges[0].from, ranges[0].from + 1, {
				class: ACTIVE_CURSOR_CLASS,
			}),
		)
	}

	view.dispatch(
		tr.setMeta(
			hoverHighlightKey,
			decos.length > 0 ? DecorationSet.create(doc, decos) : DecorationSet.empty,
		),
	)
}
