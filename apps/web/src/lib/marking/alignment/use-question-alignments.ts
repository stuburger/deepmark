"use client"

import { useMemo } from "react"
import type { GradingResult, PageToken, StudentPaperAnnotation } from "../types"
import { alignTokensToAnswer } from "./align"
import { deriveTextMarks } from "./marks"
import type { TextMark, TokenAlignment } from "./types"

export type QuestionAlignments = {
	/** Per-question text marks derived from annotations + alignment */
	marksByQuestion: Map<string, TextMark[]>
	/** Per-question token-to-char alignment (needed for reverse mapping) */
	alignmentByQuestion: Map<string, TokenAlignment>
	/** Per-question OCR tokens filtered by question_id */
	tokensByQuestion: Map<string, PageToken[]>
}

/**
 * Builds a TokenAlignment from pre-computed char offsets on tokens.
 * Used when the backend has already run alignment and stored the result.
 */
function alignmentFromPrecomputed(tokens: PageToken[]): TokenAlignment | null {
	const tokenMap: Record<string, { start: number; end: number }> = {}
	let aligned = 0

	for (const t of tokens) {
		if (t.answer_char_start != null && t.answer_char_end != null) {
			tokenMap[t.id] = { start: t.answer_char_start, end: t.answer_char_end }
			aligned++
		}
	}

	if (aligned === 0) return null
	return { tokenMap, confidence: aligned / tokens.length }
}

/**
 * Computes token alignment, text marks, and per-question token maps
 * from grading results, annotations, and page tokens.
 *
 * Uses pre-computed char offsets from the backend when available,
 * falling back to frontend Levenshtein alignment for older submissions.
 */
export function useQuestionAlignments(
	gradingResults: GradingResult[],
	annotations: StudentPaperAnnotation[],
	pageTokens: PageToken[],
): QuestionAlignments {
	return useMemo(() => {
		const marks = new Map<string, TextMark[]>()
		const alignments = new Map<string, TokenAlignment>()
		const tokensMap = new Map<string, PageToken[]>()

		// Diagnostic — remove once the annotations-not-rendering issue is
		// understood. Logs per-question counts so we can see where marks are
		// being lost (tokens missing vs alignment failing vs annotations
		// not matching question id vs deriveTextMarks skipping).
		const diag: Record<string, unknown> = {
			totalAnnotations: annotations.length,
			totalPageTokens: pageTokens.length,
			perQuestion: {} as Record<string, unknown>,
		}

		for (const r of gradingResults) {
			if (r.marking_method === "deterministic") continue

			const qTokens = pageTokens.filter((t) => t.question_id === r.question_id)
			const qAnnotations = annotations.filter(
				(a) => a.question_id === r.question_id,
			)
			;(diag.perQuestion as Record<string, unknown>)[r.question_number] = {
				tokens: qTokens.length,
				annotations: qAnnotations.length,
			}

			if (qTokens.length === 0) continue

			tokensMap.set(r.question_id, qTokens)

			const precomputed = alignmentFromPrecomputed(qTokens)
			const alignment =
				precomputed ?? alignTokensToAnswer(r.student_answer, qTokens)

			if (Object.keys(alignment.tokenMap).length === 0) continue

			alignments.set(r.question_id, alignment)

			if (qAnnotations.length === 0) continue

			const derived = deriveTextMarks(qAnnotations, alignment)
			if (derived.length > 0) {
				marks.set(r.question_id, derived)
			}
			;(diag.perQuestion as Record<string, Record<string, unknown>>)[
				r.question_number
			].derivedMarks = derived.length
			;(diag.perQuestion as Record<string, Record<string, unknown>>)[
				r.question_number
			].alignmentSize = Object.keys(alignment.tokenMap).length
		}

		console.log("[alignments]", diag)

		return {
			marksByQuestion: marks,
			alignmentByQuestion: alignments,
			tokensByQuestion: tokensMap,
		}
	}, [gradingResults, annotations, pageTokens])
}
