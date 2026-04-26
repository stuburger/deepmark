import { Node, mergeAttributes } from "@tiptap/core"

/**
 * Schema-only definition of the `mcqAnswer` atom block. Web extends with a
 * React NodeView; server-side schema callers use this directly.
 */
export const McqAnswerNodeSchema = Node.create({
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
})
