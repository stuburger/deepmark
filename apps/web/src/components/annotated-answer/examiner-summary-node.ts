import { Node, mergeAttributes } from "@tiptap/core"
import { ReactNodeViewRenderer } from "@tiptap/react"
import { ExaminerSummaryView } from "./examiner-summary-view"

/**
 * Block node for the AI-generated examiner summary at the top of the paper.
 *
 * Unlike the `questionAnswer` nodes below it, this node IS editable — the
 * `ReadOnlyText` plugin has an explicit carve-out that allows ReplaceSteps
 * whose positions fall inside this node. Changes are auto-saved via a
 * debounced server action in the NodeView.
 *
 * The `jobId` attribute is the only stored attr — the text lives as normal
 * PM inline content so that the editor cursor, undo/redo, etc. all work
 * naturally.
 *
 * Enter inserts a hard break instead of splitting the block (consistent with
 * questionAnswer behaviour).
 */
export const ExaminerSummaryNode = Node.create({
	name: "examinerSummary",
	group: "block",
	content: "inline*",
	draggable: false,
	isolating: true,

	addAttributes() {
		return {
			jobId: { default: null },
		}
	},

	parseHTML() {
		return [{ tag: "div[data-examiner-summary]" }]
	},

	renderHTML({ HTMLAttributes }) {
		return [
			"div",
			mergeAttributes(HTMLAttributes, { "data-examiner-summary": "true" }),
			0,
		]
	},

	addNodeView() {
		return ReactNodeViewRenderer(ExaminerSummaryView)
	},

	addKeyboardShortcuts() {
		return {
			Enter: ({ editor }) => editor.commands.setHardBreak(),
		}
	},
})
