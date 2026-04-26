import { Node } from "@tiptap/core"

/**
 * Free-form teacher note block — plain paragraph in the document model.
 *
 * Only standard formatting marks (bold, italic, underline) are permitted —
 * annotation marks (tick, cross, etc.) are blocked at the schema level.
 */
export const ParagraphNode = Node.create({
	name: "paragraph",
	group: "block",
	content: "inline*",
	marks: "bold italic underline",
	draggable: false,

	parseHTML() {
		return [{ tag: "p" }]
	},

	renderHTML() {
		return ["p", {}, 0]
	},
})
