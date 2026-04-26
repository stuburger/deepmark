import { McqAnswerNodeSchema } from "@mcp-gcse/shared"
import { ReactNodeViewRenderer } from "@tiptap/react"
import { McqAnswerView } from "./mcq-answer-view"

/**
 * Web-side `mcqAnswer` extension: extends the shared schema with a React
 * NodeView that renders the MCQ options grid, student answer, and score.
 */
export const McqAnswerNode = McqAnswerNodeSchema.extend({
	addNodeView() {
		return ReactNodeViewRenderer(McqAnswerView)
	},
})
