import { Node, mergeAttributes } from "@tiptap/core"
import { ReactNodeViewRenderer } from "@tiptap/react"
import { McqAnswerView } from "./mcq-answer-view"

/**
 * Atom block node representing an MCQ question in the annotated answer sheet.
 * Non-editable — renders the MCQ options grid, student answer, and score
 * via a React NodeView. All grading data is in node attrs (static per doc build).
 */
export const McqAnswerNode = Node.create({
	name: "mcqAnswer",
	group: "block",
	atom: true,
	draggable: false,
	isolating: true,

	addAttributes() {
		return {
			questionId: { default: null },
			questionNumber: { default: null },
			questionText: { default: null },
			maxScore: { default: null },
			options: { default: [] },
			correctLabels: { default: [] },
			studentAnswer: { default: null },
			awardedScore: { default: 0 },
		}
	},

	parseHTML() {
		return [{ tag: "div[data-mcq-question-id]" }]
	},

	renderHTML({ HTMLAttributes }) {
		return [
			"div",
			mergeAttributes(HTMLAttributes, {
				"data-mcq-question-id": HTMLAttributes.questionId,
			}),
		]
	},

	addNodeView() {
		return ReactNodeViewRenderer(McqAnswerView)
	},
})
