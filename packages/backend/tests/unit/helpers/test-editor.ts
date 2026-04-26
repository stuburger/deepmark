import type { EditorView } from "@tiptap/pm/view"
import * as Y from "yjs"
import { createHeadlessView } from "../../../src/lib/collab/headless-editor"

/**
 * Spin up a fresh local Y.Doc bound to a real headless ProseMirror
 * EditorView via ySyncPlugin. No Hocuspocus, no WebSocket — pure
 * in-process exercise of the editor-ops against the same editor stack the
 * Lambda runs in production.
 *
 * Caller must invoke `cleanup()` to destroy the view + doc.
 */
export function createTestEditor(): {
	doc: Y.Doc
	view: EditorView
	cleanup: () => void
} {
	const doc = new Y.Doc()
	const view = createHeadlessView(doc)
	return {
		doc,
		view,
		cleanup: () => {
			view.destroy()
			doc.destroy()
		},
	}
}
