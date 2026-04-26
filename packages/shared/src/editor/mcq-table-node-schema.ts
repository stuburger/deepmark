import { Node, mergeAttributes } from "@tiptap/core"

/**
 * Schema-only definition of the `mcqTable` atom block. Web extends with a
 * React NodeView; server-side schema callers use this directly.
 */
export const McqTableNodeSchema = Node.create({
	name: "mcqTable",
	group: "block",
	atom: true,
	draggable: false,
	isolating: true,

	addAttributes() {
		return {
			results: { default: [] },
		}
	},

	parseHTML() {
		return [{ tag: "div[data-mcq-table]" }]
	},

	renderHTML({ HTMLAttributes }) {
		return ["div", mergeAttributes(HTMLAttributes, { "data-mcq-table": "" })]
	},
})
