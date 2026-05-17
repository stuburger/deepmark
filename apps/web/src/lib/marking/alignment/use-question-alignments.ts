"use client"

import {
	type TextMark,
	type TokenAlignment,
	deriveTextMarks,
	tokenAlignmentFromOffsets,
} from "@mcp-gcse/shared"
import { useMemo } from "react"
import type { GradingResult, PageToken, StudentPaperAnnotation } from "../types"

export type QuestionAlignments = {
	/** Per-question text marks derived from annotations + alignment */
	marksByQuestion: Map<string, TextMark[]>
	/** Per-question token-to-char alignment (needed for reverse mapping) */
	alignmentByQuestion: Map<string, TokenAlignment>
	/** Per-question OCR tokens filtered by question_id */
	tokensByQuestion: Map<string, PageToken[]>
}

/**
 * Computes token alignment, text marks, and per-question token maps from
 * grading results, annotations, and page tokens.
 *
 * Reads precomputed `answer_char_start` / `answer_char_end` directly off
 * the token rows (populated upstream by the extract Lambda's
 * `mapTokensToChars` step). Pure reshape — NO LEVENSHTEIN, NO FUZZY
 * MATCHING, NO IN-MEMORY ALIGNMENT. See CLAUDE.md.
 *
 * Tokens whose offsets are null (page artifacts the extract LLM didn't
 * map to any answer word) are skipped — no fallback.
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

			const alignment = tokenAlignmentFromOffsets(qTokens)
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
