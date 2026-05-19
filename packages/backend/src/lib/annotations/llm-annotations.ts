import { logger } from "@/lib/infra/logger"
import { outputSchema } from "@/lib/infra/output-schema"
import { alignTokensToAnswer } from "@mcp-gcse/shared"
import { generateText } from "ai"
import { buildAnnotationPrompt } from "./annotation-prompt"
import { AnnotationPlanSchema } from "./annotation-schema"
import { buildOverlay } from "./payload-builder"
import { resolveTokenSpanByCharRange } from "./token-spans"
import type { AnnotateOneQuestionArgs, PendingAnnotation } from "./types"

const TAG = "annotations"

export async function annotateOneQuestion(
	args: AnnotateOneQuestionArgs,
): Promise<PendingAnnotation[]> {
	const {
		gradingResult,
		stimuli,
		allTokens,
		examBoard,
		levelDescriptors,
		subject,
		markScheme,
		llm,
		jobId,
		timeoutMs,
	} = args

	// Filter tokens for this question. Used downstream to compute the bbox
	// hull for each annotation's char range (the LLM emits a char range only;
	// per-mark bbox is derived from the underlying OCR tokens).
	const questionTokens = allTokens.filter(
		(t) => t.question_id === gradingResult.question_id,
	)

	if (questionTokens.length === 0) {
		logger.info(TAG, "No tokens for question — skipping annotation", {
			jobId,
			question_id: gradingResult.question_id,
		})
		return []
	}

	const answer = gradingResult.student_answer
	if (answer.length === 0) {
		logger.info(TAG, "Empty student_answer — skipping annotation", {
			jobId,
			question_id: gradingResult.question_id,
		})
		return []
	}

	const pageTokens = questionTokens.map((t) => ({
		id: t.id,
		page_order: t.page_order,
		para_index: 0,
		line_index: 0,
		word_index: 0,
		text_raw: t.text_raw,
		text_corrected: t.text_corrected,
		bbox: t.bbox as [number, number, number, number],
		confidence: 0,
		question_id: t.question_id,
		answer_char_start: t.answer_char_start,
		answer_char_end: t.answer_char_end,
	}))

	// Fuzzy align tokens → clean-text char positions ONCE per question. The
	// alignment is consumed by `resolveTokenSpanByCharRange` to map an LLM-
	// emitted char range back to its underlying OCR tokens (for bbox + token
	// IDs). The LLM itself never sees this — it works against the canonical
	// clean answer text and emits char offsets directly.
	const alignment = alignTokensToAnswer(answer, pageTokens)

	const markSchemeContext = markScheme
		? {
				description: markScheme.description,
				guidance: markScheme.guidance,
				markPoints: markScheme.mark_points.map((mp) => ({
					pointNumber: mp.pointNumber,
					description: mp.description,
					criteria: mp.criteria,
				})),
				markingMethod: markScheme.marking_method,
				content: markScheme.content,
			}
		: null

	const prompt = buildAnnotationPrompt({
		gradingResult,
		questionText: gradingResult.question_text,
		stimuli,
		maxScore: gradingResult.max_score,
		examBoard,
		subject,
		markScheme: markSchemeContext,
		levelDescriptors,
	})

	const plan = await llm.call(
		"llm-annotations",
		async (model, entry, report, signal) => {
			const result = await generateText({
				model,
				abortSignal: signal,
				temperature: entry.temperature,
				system:
					"You are an expert GCSE examiner producing structured annotations for a student's exam script. Output valid JSON matching the schema. Be precise and concise.",
				messages: [{ role: "user", content: prompt }],
				output: outputSchema(AnnotationPlanSchema),
			})
			report.usage = result.usage
			return result.output
		},
		{ timeoutMs },
	)

	const pending: PendingAnnotation[] = []

	for (let i = 0; i < plan.annotations.length; i++) {
		const item = plan.annotations[i]

		// ── Phrase resolution ────────────────────────────────────────────
		// The LLM emits a verbatim phrase from the student's answer. We
		// resolve it via exact-string search — no fuzzy match, no char
		// counting on the LLM's side. The prompt requires phrase to be
		// unique within the answer; ambiguous matches default to the first
		// occurrence (logged) since annotators typically refer to the
		// earliest mention.
		const charStart = answer.indexOf(item.phrase)
		if (charStart < 0) {
			logger.info(
				TAG,
				"Annotation phrase not found in answer — skipping (LLM hallucination check)",
				{
					jobId,
					question_id: gradingResult.question_id,
					phrase: item.phrase.slice(0, 80),
				},
			)
			continue
		}
		const charEnd = charStart + item.phrase.length
		if (answer.indexOf(item.phrase, charStart + 1) >= 0) {
			logger.info(
				TAG,
				"Annotation phrase appears multiple times — defaulting to first occurrence",
				{
					jobId,
					question_id: gradingResult.question_id,
					phrase: item.phrase.slice(0, 80),
				},
			)
		}

		// ── Resolve bbox / token IDs from the char range ─────────────────
		const span = resolveTokenSpanByCharRange(
			charStart,
			charEnd,
			pageTokens,
			alignment,
		)
		if (!span) {
			logger.info(
				TAG,
				"No OCR tokens overlap annotation char range — skipping",
				{
					jobId,
					question_id: gradingResult.question_id,
					char_start: charStart,
					char_end: charEnd,
					phrase: item.phrase.slice(0, 60),
				},
			)
			continue
		}

		const overlay = buildOverlay(item)
		if (!overlay) {
			// LLM returned an item missing signal or reason. Schema enforces
			// both as required, so this is belt-and-suspenders.
			logger.info(TAG, "Annotation item missing signal or reason — skipping", {
				jobId,
				question_id: gradingResult.question_id,
				has_signal: Boolean(item.signal),
				has_reason: Boolean(item.reason),
			})
			continue
		}

		pending.push({
			questionId: gradingResult.question_id,
			pageOrder: span.pageOrder,
			...overlay,
			sentiment: item.sentiment,
			phrase: item.phrase,
			charStart,
			charEnd,
			anchorTokenStartId: span.startTokenId,
			anchorTokenEndId: span.endTokenId,
			bbox: span.bbox,
			sortOrder: i,
		})
	}

	return pending
}
