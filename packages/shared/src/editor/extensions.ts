import Bold from "@tiptap/extension-bold"
import Document from "@tiptap/extension-document"
import HardBreak from "@tiptap/extension-hard-break"
import Italic from "@tiptap/extension-italic"
import Text from "@tiptap/extension-text"
import Underline from "@tiptap/extension-underline"
import { annotationMarks } from "./annotation-marks"
import { McqAnswerNodeSchema } from "./mcq-answer-node-schema"
import { McqTableNodeSchema } from "./mcq-table-node-schema"
import { OcrTokenMark } from "./ocr-token-mark"
import { ParagraphNode } from "./paragraph-node"
import { QuestionAnswerNodeSchema } from "./question-answer-node-schema"

/**
 * Top-level document schema — restricts the doc body to the three block
 * types the annotated-answer editor allows.
 *
 * Uses `+` (one or more) so the browser editor always has at least one
 * inline-content anchor (PM's TextSelection init throws on a doc with no
 * inline content). When ySyncPlugin auto-fills an empty fragment, it
 * creates a single empty paragraph; `insertQuestionBlock` detects that
 * placeholder and replaces it with the first real questionAnswer rather
 * than appending after it.
 *
 * Web's editor uses an identical `Document.extend({ content: ... })` so
 * server- and client-side schemas round-trip Y.Doc state without errors.
 */
const DocumentSchema = Document.extend({
	content: "(paragraph | questionAnswer | mcqTable)+",
})

/**
 * Canonical editor extension list — the single source of truth for the
 * annotated-answer editor schema. Web editor instantiation re-uses these
 * but swaps in node extensions that add NodeViews + keyboard shortcuts;
 * server-side `getSchema(editorExtensions)` callers (Lambda transactions,
 * projection handler) consume this directly.
 */
export const editorExtensions = [
	DocumentSchema,
	Text,
	HardBreak,
	Bold,
	Italic,
	Underline,
	ParagraphNode,
	QuestionAnswerNodeSchema,
	McqTableNodeSchema,
	McqAnswerNodeSchema,
	...annotationMarks,
	OcrTokenMark,
]
