import { editorExtensions } from "@mcp-gcse/shared"
import { getSchema } from "@tiptap/core"
import type { Schema } from "@tiptap/pm/model"

let cachedSchema: Schema | null = null

/**
 * Returns the canonical PM Schema derived from `editorExtensions` in the
 * shared editor module. Memoised so the headless EditorView, projection
 * decoding, and migration scripts all share one Schema instance.
 *
 * The schema is byte-identical to the one the web editor instantiates from
 * the same `editorExtensions` array, which is what allows Y.Doc state to
 * round-trip between Lambda writers and browser readers without errors.
 */
export function getEditorSchema(): Schema {
	if (!cachedSchema) {
		cachedSchema = getSchema(editorExtensions)
	}
	return cachedSchema
}
