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
 * Build one "+" insert-row widget DOM element for the given doc position.
 * The widget is a block-level element that sits naturally in the document
 * flow between blocks. It starts at low opacity and brightens on :hover.
 */
function buildInsertWidget(insertPos: number): Decoration {
	const wrapper = document.createElement("div")
	wrapper.className =
		"insert-paragraph-row flex items-center gap-2 px-1 py-0.5 group/insertrow"
	wrapper.style.display = "flex"
	wrapper.setAttribute("data-insert-at", String(insertPos))
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
	btn.setAttribute("data-insert-at", String(insertPos))

	const line = document.createElement("div")
	line.className = [
		"flex-1 h-px",
		"bg-zinc-200 dark:bg-zinc-700",
		"opacity-0 group-hover/insertrow:opacity-100 transition-opacity",
	].join(" ")

	wrapper.appendChild(btn)
	wrapper.appendChild(line)

	return Decoration.widget(insertPos, wrapper, {
		// `side: -1` for the top-of-doc widget keeps it visually above the first
		// block. `side: 1` for between/after-block widgets keeps them attached
		// to the preceding block when the cursor lands at the boundary.
		side: insertPos === 0 ? -1 : 1,
		key: `insert-at-${insertPos}`,
	})
}

/**
 * Place a "+" insert widget after every opaque block, AND at the top of the
 * doc when the first child is an opaque block (so the teacher can drop in an
 * examiner-comment paragraph at the top — there's no other affordance for
 * inserting before the first block).
 */
function buildDecorations(doc: PmNode): DecorationSet {
	const widgets: Decoration[] = []

	const first = doc.firstChild
	if (first && OPAQUE_BLOCK_TYPES.has(first.type.name)) {
		widgets.push(buildInsertWidget(0))
	}

	doc.forEach((node, offset) => {
		if (!OPAQUE_BLOCK_TYPES.has(node.type.name)) return
		widgets.push(buildInsertWidget(offset + node.nodeSize))
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
							const el = target.closest<HTMLElement>("[data-insert-at]")
							if (!el) return false

							event.preventDefault()
							const insertPos = Number(el.getAttribute("data-insert-at"))
							const paragraphType = view.state.schema.nodes.paragraph
							if (!paragraphType) return false

							const tr = view.state.tr.insert(insertPos, paragraphType.create())
							tr.setSelection(TextSelection.create(tr.doc, insertPos + 1))
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
