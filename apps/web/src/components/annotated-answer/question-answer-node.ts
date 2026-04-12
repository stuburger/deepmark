import { Node, mergeAttributes } from "@tiptap/core"
import { ReactNodeViewRenderer } from "@tiptap/react"
import { QuestionAnswerView } from "./question-answer-view"

/**
 * Custom block node representing a single question's answer in the
 * annotated answer sheet. Contains flat inline content with annotation marks.
 *
 * Rendered via a React NodeView that shows a non-editable question header
 * above the editable answer content.
 *
 * Enter inserts a hard break (<br>) instead of splitting the block.
 */
export const QuestionAnswerNode = Node.create({
	name: "questionAnswer",
	group: "block",
	content: "inline*",
	draggable: false,
	isolating: true,

	addAttributes() {
		return {
			questionId: { default: null },
			questionNumber: { default: null },
			questionText: { default: null },
			maxScore: { default: null },
		}
	},

	parseHTML() {
		return [{ tag: "div[data-question-id]" }]
	},

	renderHTML({ HTMLAttributes }) {
		return [
			"div",
			mergeAttributes(HTMLAttributes, {
				"data-question-id": HTMLAttributes.questionId,
				"data-question-number": HTMLAttributes.questionNumber,
			}),
			0,
		]
	},

	addNodeView() {
		return ReactNodeViewRenderer(QuestionAnswerView)
	},

	addKeyboardShortcuts() {
		return {
			Enter: ({ editor }) => {
				// Insert a hard break instead of splitting the questionAnswer block
				return editor.commands.setHardBreak()
			},
		}
	},
})
