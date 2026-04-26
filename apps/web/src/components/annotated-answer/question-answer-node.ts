import { QuestionAnswerNodeSchema } from "@mcp-gcse/shared"
import { ReactNodeViewRenderer } from "@tiptap/react"
import { QuestionAnswerView } from "./question-answer-view"

/**
 * Web-side `questionAnswer` extension: extends the shared schema with a
 * React NodeView (non-editable question header above editable answer
 * content) and an Enter shortcut that inserts a hard break.
 */
export const QuestionAnswerNode = QuestionAnswerNodeSchema.extend({
	addNodeView() {
		return ReactNodeViewRenderer(QuestionAnswerView)
	},

	addKeyboardShortcuts() {
		return {
			Enter: ({ editor }) => editor.commands.setHardBreak(),
		}
	},
})
