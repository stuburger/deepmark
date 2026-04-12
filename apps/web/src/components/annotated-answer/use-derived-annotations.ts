"use client"

import {
	type TokenAlignment,
	charRangeToTokens,
} from "@/lib/marking/token-alignment"
import type {
	AnnotationPayload,
	MarkPayload,
	OverlayType,
	PageToken,
	StudentPaperAnnotation,
} from "@/lib/marking/types"
import type { Editor } from "@tiptap/core"
import type { Node as PmNode } from "@tiptap/pm/model"
import { useEffect, useState } from "react"

// ─── Tiptap mark name → annotation fields ──────────────────────────────────

type MarkMapping = {
	overlayType: OverlayType
	buildPayload: (attrs: Record<string, unknown>) => AnnotationPayload
}

export const TIPTAP_MARK_TO_ANNOTATION: Record<string, MarkMapping> = {
	tick: {
		overlayType: "mark",
		buildPayload: (a) =>
			({ _v: 1, signal: "tick", reason: a.reason ?? "" }) as MarkPayload,
	},
	cross: {
		overlayType: "mark",
		buildPayload: (a) =>
			({ _v: 1, signal: "cross", reason: a.reason ?? "" }) as MarkPayload,
	},
	annotationUnderline: {
		overlayType: "mark",
		buildPayload: (a) =>
			({
				_v: 1,
				signal: "underline",
				reason: a.reason ?? "",
			}) as MarkPayload,
	},
	doubleUnderline: {
		overlayType: "mark",
		buildPayload: (a) =>
			({
				_v: 1,
				signal: "double_underline",
				reason: a.reason ?? "",
			}) as MarkPayload,
	},
	box: {
		overlayType: "mark",
		buildPayload: (a) =>
			({ _v: 1, signal: "box", reason: a.reason ?? "" }) as MarkPayload,
	},
	circle: {
		overlayType: "mark",
		buildPayload: (a) =>
			({ _v: 1, signal: "circle", reason: a.reason ?? "" }) as MarkPayload,
	},
	aoTag: {
		overlayType: "tag",
		buildPayload: (a) =>
			({
				_v: 1,
				category: a.category ?? "AO1",
				display: a.display ?? "AO1",
				awarded: a.awarded ?? true,
				quality: a.quality ?? "valid",
				reason: a.reason ?? "",
			}) as AnnotationPayload,
	},
	chain: {
		overlayType: "chain",
		buildPayload: (a) =>
			({
				_v: 1,
				chainType: a.chainType ?? "reasoning",
				phrase: a.phrase ?? "",
			}) as AnnotationPayload,
	},
}

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
	let idCounter = 0

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
				const mapping = TIPTAP_MARK_TO_ANNOTATION[mark.type.name]
				if (!mapping) continue

				const attrs = mark.attrs as Record<string, unknown>
				const charFrom = childOffset
				const charTo = childOffset + child.nodeSize

				const span = charRangeToTokens(charFrom, charTo, alignment, tokens)
				if (!span) continue

				// Use annotationId from AI marks, or generate a deterministic ID
				const existingId = attrs.annotationId as string | null
				const id =
					existingId ??
					`derived-${questionId}-${mark.type.name}-${charFrom}-${charTo}`

				// Deduplicate: same key shouldn't appear twice
				const key = `${questionId}-${mark.type.name}-${charFrom}-${charTo}`
				if (annotations.some((a) => a.id === key || a.id === existingId)) {
					continue
				}

				idCounter++

				annotations.push({
					id: existingId ?? key,
					enrichment_run_id: existingId ? "ai" : "teacher",
					question_id: questionId,
					page_order: span.pageOrder,
					overlay_type: mapping.overlayType,
					sentiment: (attrs.sentiment as string) ?? "neutral",
					payload: mapping.buildPayload(attrs),
					bbox: span.bbox,
					parent_annotation_id: null,
					anchor_token_start_id: span.startTokenId,
					anchor_token_end_id: span.endTokenId,
				})
			}
		})
	})

	return annotations
}

// ─── React hook ────────────────────────────────────────────────────────────

/**
 * Derives StudentPaperAnnotation[] from the current PM editor state.
 * Recomputes on every transaction (mark add/remove, undo/redo, etc).
 *
 * Returns a stable array reference when marks haven't changed (compared
 * by a deterministic key string to avoid unnecessary re-renders).
 */
export function useDerivedAnnotations(
	editor: Editor | null,
	alignmentByQuestion: Map<string, TokenAlignment>,
	tokensByQuestion: Map<string, PageToken[]>,
): StudentPaperAnnotation[] {
	const [annotations, setAnnotations] = useState<StudentPaperAnnotation[]>([])

	useEffect(() => {
		if (!editor) return

		const handleTransaction = () => {
			const derived = deriveAnnotationsFromDoc(
				editor.state.doc,
				alignmentByQuestion,
				tokensByQuestion,
			)

			// Only update state if the set of annotations actually changed
			setAnnotations((prev) => {
				const prevKey = prev
					.map((a) => a.id)
					.sort()
					.join(",")
				const newKey = derived
					.map((a) => a.id)
					.sort()
					.join(",")
				if (prevKey === newKey) return prev
				return derived
			})
		}

		// Derive once on mount (for initial AI marks)
		handleTransaction()

		editor.on("transaction", handleTransaction)
		return () => {
			editor.off("transaction", handleTransaction)
		}
	}, [editor, alignmentByQuestion, tokensByQuestion])

	return annotations
}
