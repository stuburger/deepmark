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
 * Computes token alignment, text marks, and per-question token maps
 * from grading results, annotations, and page tokens.
 *
 * Shared between the card view (AnnotatedAnswer) and sheet view
 * (AnnotatedAnswerSheet) to avoid duplicating alignment computation.
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

		for (const r of gradingResults) {
			if (r.marking_method === "deterministic") continue

			const qTokens = pageTokens.filter((t) => t.question_id === r.question_id)
			if (qTokens.length === 0) continue

			tokensMap.set(r.question_id, qTokens)

			const alignment = alignTokensToAnswer(r.student_answer, qTokens)
			if (Object.keys(alignment.tokenMap).length === 0) continue

			alignments.set(r.question_id, alignment)

			const qAnnotations = annotations.filter(
				(a) => a.question_id === r.question_id,
			)
			if (qAnnotations.length === 0) continue

			const derived = deriveTextMarks(qAnnotations, alignment)
			if (derived.length > 0) {
				marks.set(r.question_id, derived)
			}
		}

		return {
			marksByQuestion: marks,
			alignmentByQuestion: alignments,
			tokensByQuestion: tokensMap,
		}
	}, [gradingResults, annotations, pageTokens])
}
