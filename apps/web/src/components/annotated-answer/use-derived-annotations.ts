"use client"

import type { StudentPaperAnnotation } from "@/lib/marking/types"
import { deriveAnnotationsFromDoc } from "@mcp-gcse/shared"
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
 * Uses ocrToken marks embedded in the document for scan token resolution —
 * no external alignment data needed.
 */
export function useDerivedAnnotations(
	editor: Editor | null,
	onChange: (annotations: StudentPaperAnnotation[]) => void,
): void {
	const prevFingerprintRef = useRef("")
	const onChangeRef = useRef(onChange)
	onChangeRef.current = onChange

	useEffect(() => {
		if (!editor) return

		const handleTransaction = () => {
			const derived = deriveAnnotationsFromDoc(editor.state.doc)

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
	}, [editor])
}
