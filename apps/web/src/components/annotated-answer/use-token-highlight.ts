import type { Editor } from "@tiptap/core"
import type { Node as PmNode } from "@tiptap/pm/model"
import { useEffect } from "react"

/**
 * Collects ocrToken mark token IDs from all text nodes in a PM range.
 * Each word in the document carries an ocrToken mark with its OCR token ID,
 * so this is a direct structural lookup — no side-channel alignment needed.
 */
function resolveTokensForRange(
	editor: { state: { doc: PmNode } },
	from: number,
	to: number,
): string[] | null {
	const tokenIds: string[] = []
	const seen = new Set<string>()

	editor.state.doc.nodesBetween(from, to, (node) => {
		if (!node.isText) return

		for (const mark of node.marks) {
			if (mark.type.name !== "ocrToken") continue
			const id = mark.attrs.tokenId as string | null
			if (id && !seen.has(id)) {
				seen.add(id)
				tokenIds.push(id)
			}
		}
	})

	return tokenIds.length > 0 ? tokenIds : null
}

/**
 * Finds all ocrToken marks on text that also carries a specific annotation ID.
 * Returns the union of token IDs across all matching text nodes.
 */
function resolveTokensForAnnotation(
	editor: { state: { doc: PmNode } },
	annotationId: string,
): string[] | null {
	const tokenIds: string[] = []
	const seen = new Set<string>()

	editor.state.doc.descendants((node) => {
		if (!node.isText) return

		const hasAnnotation = node.marks.some(
			(m) => (m.attrs.annotationId as string | null) === annotationId,
		)
		if (!hasAnnotation) return

		for (const mark of node.marks) {
			if (mark.type.name !== "ocrToken") continue
			const id = mark.attrs.tokenId as string | null
			if (id && !seen.has(id)) {
				seen.add(id)
				tokenIds.push(id)
			}
		}
	})

	return tokenIds.length > 0 ? tokenIds : null
}

/**
 * Returns the ocrToken ID at a collapsed cursor position.
 * Checks the text node to the right of the cursor first (the word the cursor
 * is inside or immediately before), then falls back to the node on the left
 * (cursor at the trailing edge of a word).
 */
function resolveTokenAtCursor(
	editor: { state: { doc: PmNode } },
	pos: number,
): string | null {
	const $pos = editor.state.doc.resolve(pos)

	const after = $pos.nodeAfter
	if (after?.isText) {
		for (const mark of after.marks) {
			if (mark.type.name === "ocrToken") return mark.attrs.tokenId as string
		}
	}

	const before = $pos.nodeBefore
	if (before?.isText) {
		for (const mark of before.marks) {
			if (mark.type.name === "ocrToken") return mark.attrs.tokenId as string
		}
	}

	return null
}

/**
 * Subscribes to editor transactions and maps selection / active annotation
 * to OCR token IDs for the scan overlay.
 */
export function useTokenHighlight(
	editor: Editor | null,
	activeAnnotationId: string | null,
	onTokenHighlight?: (tokenIds: string[] | null) => void,
): void {
	useEffect(() => {
		if (!editor || !onTokenHighlight) return

		const handleUpdate = () => {
			const { from, to } = editor.state.selection
			const hasSelection = from !== to

			if (hasSelection) {
				onTokenHighlight(resolveTokensForRange(editor, from, to))
				return
			}

			if (activeAnnotationId) {
				onTokenHighlight(resolveTokensForAnnotation(editor, activeAnnotationId))
				return
			}

			const cursorToken = resolveTokenAtCursor(editor, from)
			onTokenHighlight(cursorToken ? [cursorToken] : null)
		}

		handleUpdate()
		editor.on("transaction", handleUpdate)
		return () => {
			editor.off("transaction", handleUpdate)
		}
	}, [editor, activeAnnotationId, onTokenHighlight])
}
