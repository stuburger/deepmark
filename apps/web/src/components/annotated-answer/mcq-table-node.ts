import { McqTableNodeSchema } from "@mcp-gcse/shared"
import { ReactNodeViewRenderer } from "@tiptap/react"
import { McqTableView } from "./mcq-table-view"

/**
 * Web-side `mcqTable` extension: extends the shared schema with a React
 * NodeView that renders a compact table of MCQ rows. All data lives in the
 * `results` attribute.
 */
export const McqTableNode = McqTableNodeSchema.extend({
	addNodeView() {
		return ReactNodeViewRenderer(McqTableView)
	},
})
