"use client"

import { TIPTAP_TO_ENTRY } from "@/lib/marking/mark-registry"
import {
	type TokenAlignment,
	charRangeToTokens,
} from "@/lib/marking/token-alignment"
import type { PageToken, StudentPaperAnnotation } from "@/lib/marking/types"
import type { Editor } from "@tiptap/core"
import type { Node as PmNode } from "@tiptap/pm/model"
import { useEffect, useRef } from "react"

// ─── Pure derivation function (testable without React/tiptap) ──────────────

/**
 * Walks a ProseMirror document and derives StudentPaperAnnotation[] from all
 * marks found inside `questionAnswer` nodes. Uses charRangeToTokens to
 * reverse-map character ranges back to OCR tokens with bounding boxes.
 *
 * Both AI marks (with annotationId attr) and teacher marks (without) are
 * included — the scan overlay should render ALL marks from the PM doc.
 */
export function deriveAnnotationsFromDoc(
	doc: PmNode,
	alignmentByQuestion: Map<string, TokenAlignment>,
	tokensByQuestion: Map<string, PageToken[]>,
): StudentPaperAnnotation[] {
	const annotations: StudentPaperAnnotation[] = []
	const seenKeys = new Set<string>()

	doc.descendants((node, pos) => {
		if (node.type.name !== "questionAnswer") return

		const questionId = node.attrs.questionId as string | null
		if (!questionId) return

		const alignment = alignmentByQuestion.get(questionId)
		const tokens = tokensByQuestion.get(questionId)
		if (!alignment || !tokens || tokens.length === 0) return

		// Walk inline content to find marks
		node.forEach((child, childOffset) => {
			if (!child.isText || !child.marks.length) return

			for (const mark of child.marks) {
				const entry = TIPTAP_TO_ENTRY.get(mark.type.name)
				if (!entry) continue

				const attrs = mark.attrs as Record<string, unknown>
				const charFrom = childOffset
				const charTo = childOffset + child.nodeSize

				const span = charRangeToTokens(charFrom, charTo, alignment, tokens)
				if (!span) continue

				const existingId = attrs.annotationId as string | null
				const key = `${questionId}-${mark.type.name}-${charFrom}-${charTo}`

				// Deduplicate — O(1) lookup via Set
				const dedupeKey = existingId ?? key
				if (seenKeys.has(dedupeKey)) continue
				seenKeys.add(dedupeKey)

				// Registry guarantees overlayType and buildPayload are paired correctly,
				// so the cast to the discriminated union is safe at this construction site.
				annotations.push({
					id: dedupeKey,
					enrichment_run_id: existingId ? "ai" : "teacher",
					question_id: questionId,
					page_order: span.pageOrder,
					overlay_type: entry.overlayType,
					sentiment: (attrs.sentiment as string) ?? "neutral",
					payload: entry.buildPayload(attrs),
					bbox: span.bbox,
					anchor_token_start_id: span.startTokenId,
					anchor_token_end_id: span.endTokenId,
				} as StudentPaperAnnotation)
			}
		})
	})

	return annotations
}

// ─── React hook ────────────────────────────────────────────────────────────

/** Compact fingerprint that captures identity + payload-relevant attrs. */
function annotationFingerprint(a: StudentPaperAnnotation): string {
	return `${a.id}|${a.overlay_type}|${a.sentiment}|${JSON.stringify(a.payload)}`
}

/**
 * Derives StudentPaperAnnotation[] from the current PM editor state and
 * calls `onChange` synchronously whenever the derived set changes.
 *
 * Uses a ref-based fingerprint to avoid unnecessary callbacks. The callback
 * fires inside the transaction handler — no render-behind delay.
 */
export function useDerivedAnnotations(
	editor: Editor | null,
	alignmentByQuestion: Map<string, TokenAlignment>,
	tokensByQuestion: Map<string, PageToken[]>,
	onChange: (annotations: StudentPaperAnnotation[]) => void,
): void {
	const prevFingerprintRef = useRef("")
	const onChangeRef = useRef(onChange)
	onChangeRef.current = onChange

	useEffect(() => {
		if (!editor) return

		const handleTransaction = () => {
			const derived = deriveAnnotationsFromDoc(
				editor.state.doc,
				alignmentByQuestion,
				tokensByQuestion,
			)

			const fp = derived.map(annotationFingerprint).sort().join("\n")
			if (fp === prevFingerprintRef.current) return

			prevFingerprintRef.current = fp
			onChangeRef.current(derived)
		}

		// Derive once on mount (for initial AI marks)
		handleTransaction()

		editor.on("transaction", handleTransaction)
		return () => {
			editor.off("transaction", handleTransaction)
		}
	}, [editor, alignmentByQuestion, tokensByQuestion])
}
