import type { Editor } from "@tiptap/core"
import { QuestionAnswerNodeSchema } from "@mcp-gcse/shared"
import { ReactNodeViewRenderer } from "@tiptap/react"
import { findEnclosingQuestionAnswer } from "./pm-pos-mapping"
import { QuestionAnswerView } from "./question-answer-view"

/**
 * Web-side `questionAnswer` extension: extends the shared schema with a
 * React NodeView (non-editable question header above editable answer
 * content) and Enter / Shift+Enter shortcuts that insert a hard break.
 *
 * Why we don't call `editor.commands.setHardBreak()`: the standard Tiptap
 * command returns `false` when the cursor's parent is `isolating: true`
 * (see @tiptap/extension-hard-break/src/hard-break.ts L86–88). Our
 * `questionAnswer` block IS isolating — we never want block splits to
 * create sibling questionAnswer blocks — so `setHardBreak` silently
 * does nothing. `Shift-Enter` is bound by the HardBreak extension to
 * `setHardBreak` and is broken for the same reason.
 *
 * Bypassing the isolating guard is safe here: we want an inline
 * `hardBreak` atom (which fits `content: "inline*"`), not a block split.
 */
function insertHardBreakIfInQuestion({ editor }: { editor: Editor }): boolean {
	// Outside a questionAnswer block (examiner-summary paragraph, mcqTable
	// boundary, …) we fall through to Tiptap's default Enter handling so
	// the leading paragraph still splits naturally on Enter.
	if (findEnclosingQuestionAnswer(editor.state.selection.$from) === null) {
		return false
	}
	return editor.chain().focus().insertContent({ type: "hardBreak" }).run()
}

export const QuestionAnswerNode = QuestionAnswerNodeSchema.extend({
	addNodeView() {
		return ReactNodeViewRenderer(QuestionAnswerView)
	},

	addKeyboardShortcuts() {
		return {
			Enter: insertHardBreakIfInQuestion,
			"Shift-Enter": insertHardBreakIfInQuestion,
		}
	},
})
