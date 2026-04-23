import { Extension } from "@tiptap/core"
import type { Node as PmNode } from "@tiptap/pm/model"
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"

/**
 * Node types that are "opaque blocks" — the teacher can't cursor into or out
 * of them naturally, so we need an explicit way to insert a paragraph after them.
 */
const OPAQUE_BLOCK_TYPES = new Set(["questionAnswer", "mcqTable"])

const insertParagraphPluginKey = new PluginKey("insertParagraph")

/**
 * Builds a full-width insert-row widget after each opaque block.
 *
 * The widget is a block-level element that sits naturally in the document
 * flow between blocks. It starts at low opacity and brightens on :hover.
 * No absolute positioning needed — PM renders it inline after the node.
 */
function buildDecorations(doc: PmNode): DecorationSet {
	const widgets: Decoration[] = []

	doc.forEach((node, offset) => {
		if (!OPAQUE_BLOCK_TYPES.has(node.type.name)) return

		const blockEnd = offset + node.nodeSize

		const wrapper = document.createElement("div")
		wrapper.className =
			"insert-paragraph-row flex items-center gap-2 px-1 py-0.5 group/insertrow"
		// block display so it sits between PM block nodes rather than inline
		wrapper.style.display = "flex"
		wrapper.setAttribute("data-insert-after", String(blockEnd))
		wrapper.contentEditable = "false"

		const btn = document.createElement("button")
		btn.type = "button"
		btn.className = [
			"flex items-center justify-center shrink-0",
			"w-5 h-5 rounded text-xs font-bold leading-none",
			"border border-zinc-300 dark:border-zinc-600",
			"bg-white dark:bg-zinc-900 text-zinc-400 dark:text-zinc-500",
			"hover:bg-blue-50 hover:text-blue-500 hover:border-blue-300",
			"dark:hover:bg-blue-950/30 dark:hover:text-blue-400",
			"transition-colors cursor-pointer select-none",
			"opacity-0 group-hover/insertrow:opacity-100",
		].join(" ")
		btn.textContent = "+"
		btn.title = "Insert note (Mod+Enter)"
		btn.setAttribute("data-insert-after", String(blockEnd))

		const line = document.createElement("div")
		line.className = [
			"flex-1 h-px",
			"bg-zinc-200 dark:bg-zinc-700",
			"opacity-0 group-hover/insertrow:opacity-100 transition-opacity",
		].join(" ")

		wrapper.appendChild(btn)
		wrapper.appendChild(line)

		widgets.push(
			Decoration.widget(blockEnd, wrapper, {
				side: 1,
				key: `insert-after-${blockEnd}`,
			}),
		)
	})

	return DecorationSet.create(doc, widgets)
}

/**
 * Extension that provides two ways to insert a paragraph after an opaque block:
 *
 * 1. **Keyboard:** `Mod+Enter` while the cursor is inside (or at the end of) any
 *    block — inserts an empty paragraph immediately after it and focuses it.
 *
 * 2. **Hover "+" button:** A PM decoration widget rendered after each
 *    `questionAnswer` / `mcqTable` block. Clicking it does the same insertion.
 */
export const InsertParagraphPlugin = Extension.create({
	name: "insertParagraphPlugin",

	addKeyboardShortcuts() {
		return {
			"Mod-Enter": ({ editor }) => {
				const { selection, doc, schema } = editor.state
				const $pos = doc.resolve(selection.from)

				// Walk up to find the topmost block child of the doc
				let topDepth = 1
				for (let d = 1; d <= $pos.depth; d++) {
					if ($pos.node(d - 1).type === doc.type) {
						topDepth = d
						break
					}
				}

				const blockStart = $pos.start(topDepth) - 1
				const blockNode = $pos.node(topDepth)
				const insertPos = blockStart + blockNode.nodeSize

				const paragraphType = schema.nodes.paragraph
				if (!paragraphType) return false

				const tr = editor.state.tr.insert(insertPos, paragraphType.create())
				// Place cursor inside the new paragraph
				const newCursorPos = insertPos + 1
				tr.setSelection(TextSelection.create(tr.doc, newCursorPos))
				editor.view.dispatch(tr)
				return true
			},
		}
	},

	addProseMirrorPlugins() {
		return [
			new Plugin({
				key: insertParagraphPluginKey,

				state: {
					init(_, state) {
						return buildDecorations(state.doc)
					},
					apply(tr, old) {
						return tr.docChanged ? buildDecorations(tr.doc) : old
					},
				},

				props: {
					decorations(state) {
						return insertParagraphPluginKey.getState(state)
					},

					handleDOMEvents: {
						mousedown(view, event) {
							const target = event.target as HTMLElement
							const el = target.closest<HTMLElement>("[data-insert-after]")
							if (!el) return false

							event.preventDefault()
							const blockEnd = Number(el.getAttribute("data-insert-after"))
							const paragraphType = view.state.schema.nodes.paragraph
							if (!paragraphType) return false

							const tr = view.state.tr.insert(blockEnd, paragraphType.create())
							tr.setSelection(TextSelection.create(tr.doc, blockEnd + 1))
							view.dispatch(tr)
							view.focus()
							return true
						},
					},
				},
			}),
		]
	},
})
