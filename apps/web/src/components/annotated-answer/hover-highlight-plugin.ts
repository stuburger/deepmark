import { charRangeToTokens } from "@/lib/marking/alignment/reverse"
import type { TokenAlignment } from "@/lib/marking/alignment/types"
import { TIPTAP_TO_ENTRY } from "@/lib/marking/mark-registry"
import type { PageToken } from "@/lib/marking/types"
import { type Editor, Extension } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"

const HIGHLIGHT_CLASS =
	"bg-yellow-200/50 dark:bg-yellow-500/30 transition-colors"

const hoverHighlightKey = new PluginKey("hoverHighlight")

type HoverHighlightOptions = {
	/** Mutable ref — always points to the latest alignment maps. */
	alignmentRef: { current: Map<string, TokenAlignment> }
	/** Mutable ref — always points to the latest token maps. */
	tokensRef: { current: Map<string, PageToken[]> }
	/** Mutable ref — always points to the latest scan-hover callback. */
	onTokenHighlightRef: {
		current: ((tokenIds: string[] | null) => void) | undefined
	}
	/** Mutable ref — always points to the latest sidebar-hover callback. */
	onAnnotationHoverRef: {
		current: ((annotationId: string | null) => void) | undefined
	}
}

/**
 * Tiptap extension for bidirectional hover linking:
 *
 * - Scan ↔ PM: token-level hover via `setHoverHighlight` / `onTokenHighlightRef`
 * - Sidebar ↔ PM: annotation-level hover via `setAnnotationHighlight` / `onAnnotationHoverRef`
 *
 * Reads from mutable refs so it always uses current values even though
 * the plugin instance is created once and never reconfigured.
 */
export const HoverHighlightPlugin = Extension.create<HoverHighlightOptions>({
	name: "hoverHighlight",

	addProseMirrorPlugins() {
		const {
			alignmentRef,
			tokensRef,
			onTokenHighlightRef,
			onAnnotationHoverRef,
		} = this.options

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

					handleDOMEvents: {
						mousemove(view, event) {
							const onTokenHighlight = onTokenHighlightRef.current
							const onAnnotationHover = onAnnotationHoverRef.current

							if (!onTokenHighlight && !onAnnotationHover) return false

							const pos = view.posAtCoords({
								left: event.clientX,
								top: event.clientY,
							})
							if (!pos) {
								onTokenHighlight?.(null)
								onAnnotationHover?.(null)
								return false
							}

							// PM → Sidebar: find annotation marks at cursor position
							if (onAnnotationHover) {
								const resolved = view.state.doc.resolve(pos.pos)
								const marks = resolved.marks()
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
							}

							// PM → Scan: reverse-map cursor position to token IDs
							if (onTokenHighlight) {
								const $pos = view.state.doc.resolve(pos.pos)
								let questionId: string | null = null
								let nodeStart = 0

								for (let d = $pos.depth; d >= 0; d--) {
									const ancestor = $pos.node(d)
									if (ancestor.type.name === "questionAnswer") {
										questionId = ancestor.attrs.questionId as string | null
										nodeStart = $pos.start(d)
										break
									}
								}

								if (!questionId) {
									onTokenHighlight(null)
									return false
								}

								const alignment = alignmentRef.current.get(questionId)
								const tokens = tokensRef.current.get(questionId)
								if (!alignment || !tokens) {
									onTokenHighlight(null)
									return false
								}

								const charOffset = pos.pos - nodeStart
								const span = charRangeToTokens(
									charOffset,
									charOffset + 1,
									alignment,
									tokens,
								)

								onTokenHighlight(span ? span.tokenIds : null)
							}

							return false
						},

						mouseleave(_view, _event) {
							onTokenHighlightRef.current?.(null)
							onAnnotationHoverRef.current?.(null)
							return false
						},
					},
				},
			}),
		]
	},
})

// ─── Helpers to set highlights from outside ─────────────────────────────────

/**
 * Highlights the text range for a given scan token ID in the PM editor.
 * Call with `null` to clear.
 */
export function setHoverHighlight(
	editor: Editor,
	tokenId: string | null,
	alignmentByQuestion: Map<string, TokenAlignment>,
): void {
	const { view } = editor
	const { doc, tr } = view.state

	if (!tokenId) {
		view.dispatch(tr.setMeta(hoverHighlightKey, DecorationSet.empty))
		return
	}

	const decos: Decoration[] = []

	doc.descendants((node, pos) => {
		if (node.type.name !== "questionAnswer") return
		const questionId = node.attrs.questionId as string | null
		if (!questionId) return

		const alignment = alignmentByQuestion.get(questionId)
		if (!alignment) return

		const offset = alignment.tokenMap[tokenId]
		if (!offset) return

		const from = pos + 1 + offset.start
		const to = pos + 1 + offset.end

		decos.push(Decoration.inline(from, to, { class: HIGHLIGHT_CLASS }))
	})

	view.dispatch(
		tr.setMeta(
			hoverHighlightKey,
			decos.length > 0 ? DecorationSet.create(doc, decos) : DecorationSet.empty,
		),
	)
}

/**
 * Highlights the text range for a given annotation ID in the PM editor.
 * Walks all marks in the doc to find the one matching the annotationId.
 * Call with `null` to clear.
 */
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
