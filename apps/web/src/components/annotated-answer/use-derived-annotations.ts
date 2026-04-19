"use client"

import { TIPTAP_TO_ENTRY } from "@/lib/marking/mark-registry"
import type { StudentPaperAnnotation } from "@/lib/marking/types"
import type { Editor } from "@tiptap/core"
import type { Node as PmNode } from "@tiptap/pm/model"
import { useEffect, useRef } from "react"

// ─── Helpers ────────────────────────────────────────────────────────────────

type OcrTokenInfo = {
	tokenId: string
	bbox: [number, number, number, number]
	pageOrder: number
}

/** Collect ocrToken mark data from a text node's marks. */
function ocrTokensFromNode(node: PmNode): OcrTokenInfo[] {
	const tokens: OcrTokenInfo[] = []
	for (const mark of node.marks) {
		if (mark.type.name !== "ocrToken") continue
		const id = mark.attrs.tokenId as string | null
		const bbox = mark.attrs.bbox as [number, number, number, number] | null
		if (id && bbox) {
			tokens.push({
				tokenId: id,
				bbox,
				pageOrder: (mark.attrs.pageOrder as number) ?? 0,
			})
		}
	}
	return tokens
}

/** Compute a bounding box hull from multiple ocrToken infos. */
function bboxHull(
	tokens: OcrTokenInfo[],
): [number, number, number, number] | null {
	if (tokens.length === 0) return null
	let yMin = Number.POSITIVE_INFINITY
	let xMin = Number.POSITIVE_INFINITY
	let yMax = Number.NEGATIVE_INFINITY
	let xMax = Number.NEGATIVE_INFINITY
	for (const t of tokens) {
		const [tY1, tX1, tY2, tX2] = t.bbox
		if (tY1 < yMin) yMin = tY1
		if (tX1 < xMin) xMin = tX1
		if (tY2 > yMax) yMax = tY2
		if (tX2 > xMax) xMax = tX2
	}
	return [yMin, xMin, yMax, xMax]
}

// ─── Pure derivation function (testable without React/tiptap) ──────────────

/**
 * Walks a ProseMirror document and derives StudentPaperAnnotation[] from all
 * annotation marks found inside `questionAnswer` nodes. Uses co-located
 * ocrToken marks to resolve bounding boxes — no external alignment data needed.
 */
export function deriveAnnotationsFromDoc(
	doc: PmNode,
): StudentPaperAnnotation[] {
	const annotations: StudentPaperAnnotation[] = []
	const seenKeys = new Set<string>()

	// First pass: collect ocrToken info per annotation ID across all text nodes.
	// An annotation mark can span multiple text nodes (split at word boundaries),
	// so we need to aggregate tokens for each annotation.
	const tokensByAnnotationKey = new Map<string, OcrTokenInfo[]>()

	doc.descendants((node, _pos) => {
		if (node.type.name !== "questionAnswer") return
		node.forEach((child) => {
			if (!child.isText || !child.marks.length) return

			const ocrTokens = ocrTokensFromNode(child)

			for (const mark of child.marks) {
				const entry = TIPTAP_TO_ENTRY.get(mark.type.name)
				if (!entry) continue

				const attrs = mark.attrs as Record<string, unknown>
				const annotationId = attrs.annotationId as string | null
				const key = annotationId ?? `${mark.type.name}-${child.textContent}`

				if (!tokensByAnnotationKey.has(key)) {
					tokensByAnnotationKey.set(key, [])
				}
				const collected = tokensByAnnotationKey.get(key)!
				for (const t of ocrTokens) {
					if (!collected.some((c) => c.tokenId === t.tokenId)) {
						collected.push(t)
					}
				}
			}
		})
	})

	// Second pass: build annotations
	doc.descendants((node, _pos) => {
		if (node.type.name !== "questionAnswer") return

		const questionId = node.attrs.questionId as string | null
		if (!questionId) return

		node.forEach((child, childOffset) => {
			if (!child.isText || !child.marks.length) return

			for (const mark of child.marks) {
				const entry = TIPTAP_TO_ENTRY.get(mark.type.name)
				if (!entry) continue

				const attrs = mark.attrs as Record<string, unknown>
				const existingId = attrs.annotationId as string | null

				const charFrom = childOffset
				const charTo = childOffset + child.nodeSize
				const key = `${questionId}-${mark.type.name}-${charFrom}-${charTo}`
				const dedupeKey = existingId ?? key
				if (seenKeys.has(dedupeKey)) continue
				seenKeys.add(dedupeKey)

				// For AI marks, use the original scan metadata carried in attrs.
				const hasScanData = attrs.scanBbox != null
				let bbox: [number, number, number, number]
				let pageOrder: number
				let startTokenId: string | null
				let endTokenId: string | null

				if (hasScanData) {
					bbox = attrs.scanBbox as [number, number, number, number]
					pageOrder = attrs.scanPageOrder as number
					startTokenId = (attrs.scanTokenStartId as string) ?? null
					endTokenId = (attrs.scanTokenEndId as string) ?? null
				} else {
					// Teacher marks: read co-located ocrToken marks
					const annotKey =
						existingId ?? `${mark.type.name}-${child.textContent}`
					const tokens = tokensByAnnotationKey.get(annotKey) ?? []
					const hull = bboxHull(tokens)
					if (!hull) continue

					bbox = hull
					pageOrder = tokens[0].pageOrder
					startTokenId = tokens[0].tokenId
					endTokenId = tokens[tokens.length - 1].tokenId
				}

				annotations.push({
					id: dedupeKey,
					// Derived annotations don't carry the server-side grading_run_id.
					// Source + linkage is decided by the server on save via the diff.
					grading_run_id: null,
					question_id: questionId,
					page_order: pageOrder,
					overlay_type: entry.overlayType,
					sentiment: (attrs.sentiment as string) ?? "neutral",
					payload: entry.buildPayload(attrs),
					bbox,
					anchor_token_start_id: startTokenId,
					anchor_token_end_id: endTokenId,
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

		// Derive once on mount (for initial AI marks)
		handleTransaction()

		editor.on("transaction", handleTransaction)
		return () => {
			editor.off("transaction", handleTransaction)
		}
	}, [editor])
}
