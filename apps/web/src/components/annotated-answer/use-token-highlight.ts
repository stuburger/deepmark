import type { TokenAlignment } from "@mcp-gcse/shared"
import type { Editor } from "@tiptap/core"
import { useEffect } from "react"
import {
	resolveTokenAtCursor,
	resolveTokensForAnnotation,
	resolveTokensForRange,
} from "./token-resolution"

/**
 * Subscribes to editor transactions and maps selection / active annotation
 * to OCR token IDs for the scan overlay. All resolution goes through the
 * per-question `TokenAlignment` (produced by `useQuestionAlignments`) —
 * no PM marks are read. Resolver implementations live in
 * `./token-resolution`; this hook is just the React glue.
 */
export function useTokenHighlight(
	editor: Editor | null,
	activeAnnotationId: string | null,
	alignmentByQuestion: ReadonlyMap<string, TokenAlignment>,
	onTokenHighlight?: (tokenIds: string[] | null) => void,
): void {
	useEffect(() => {
		if (!editor || !onTokenHighlight) return

		const handleUpdate = () => {
			const { from, to } = editor.state.selection
			const hasSelection = from !== to

			if (hasSelection) {
				onTokenHighlight(
					resolveTokensForRange(editor.state.doc, from, to, alignmentByQuestion),
				)
				return
			}

			if (activeAnnotationId) {
				onTokenHighlight(
					resolveTokensForAnnotation(
						editor.state.doc,
						activeAnnotationId,
						alignmentByQuestion,
					),
				)
				return
			}

			const cursorToken = resolveTokenAtCursor(
				editor.state.doc,
				from,
				alignmentByQuestion,
			)
			onTokenHighlight(cursorToken ? [cursorToken] : null)
		}

		handleUpdate()
		editor.on("transaction", handleUpdate)
		return () => {
			editor.off("transaction", handleUpdate)
		}
	}, [editor, activeAnnotationId, alignmentByQuestion, onTokenHighlight])
}
