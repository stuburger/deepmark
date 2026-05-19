"use client"

import type { PageToken, StudentPaperAnnotation } from "@/lib/marking/types"
import { type TokenAlignment, deriveAnnotationsFromDoc } from "@mcp-gcse/shared"
import type { Editor } from "@tiptap/core"
import { useEffect, useRef } from "react"

export { deriveAnnotationsFromDoc }

/** Compact fingerprint that captures identity + payload-relevant attrs. */
function annotationFingerprint(a: StudentPaperAnnotation): string {
	return `${a.id}|${a.overlay_type}|${a.sentiment}|${JSON.stringify(a.payload)}`
}

/**
 * Derives StudentPaperAnnotation[] from the current PM editor state and
 * calls `onChange` synchronously whenever the derived set changes.
 *
 * `alignmentByQuestion` + `tokensByQuestion` come from
 * `useQuestionAlignments`. Passing the pre-computed alignment is what
 * keeps every keystroke from triggering a full Levenshtein pass per
 * question. Without it the function would fall back to computing
 * alignment inline on each PM transaction — fine for the projection
 * Lambda (one-shot per snapshot) but a performance bug in the editor.
 */
export function useDerivedAnnotations(
	editor: Editor | null,
	onChange: (annotations: StudentPaperAnnotation[]) => void,
	alignmentByQuestion?: ReadonlyMap<string, TokenAlignment>,
	tokensByQuestion?: ReadonlyMap<string, ReadonlyArray<PageToken>>,
): void {
	const prevFingerprintRef = useRef("")
	const onChangeRef = useRef(onChange)
	onChangeRef.current = onChange

	useEffect(() => {
		if (!editor) return

		const handleTransaction = () => {
			const derived = deriveAnnotationsFromDoc(editor.state.doc, {
				alignmentByQuestion,
				tokensByQuestion,
			})

			const fp = derived.map(annotationFingerprint).sort().join("\n")
			if (fp === prevFingerprintRef.current) return

			prevFingerprintRef.current = fp
			onChangeRef.current(derived)
		}

		handleTransaction()

		editor.on("transaction", handleTransaction)
		return () => {
			editor.off("transaction", handleTransaction)
		}
		// Both maps are memoised by `useQuestionAlignments` — identity only
		// changes when their inputs change, so this deps array doesn't cause
		// render storms.
	}, [editor, alignmentByQuestion, tokensByQuestion])
}
