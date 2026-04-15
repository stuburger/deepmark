import { Node, mergeAttributes } from "@tiptap/core"
import { ReactNodeViewRenderer } from "@tiptap/react"
import { McqTableView } from "./mcq-table-view"

/**
 * Atom block node that renders ALL MCQ questions for a submission as a single
 * compact table. Each row shows Q number, correct answer, student answer, and
 * mark. Clicking a row opens a popover with the full options grid.
 *
 * All data lives in the `results` attribute — an array of per-question objects.
 */
export const McqTableNode = Node.create({
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
		return [
			"div",
			mergeAttributes(HTMLAttributes, { "data-mcq-table": "" }),
		]
	},

	addNodeView() {
		return ReactNodeViewRenderer(McqTableView)
	},
})
