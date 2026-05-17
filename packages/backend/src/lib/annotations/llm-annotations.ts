import { logger } from "@/lib/infra/logger"
import { outputSchema } from "@/lib/infra/output-schema"
import { generateText } from "ai"
import { buildAnnotationPrompt } from "./annotation-prompt"
import { AnnotationPlanSchema } from "./annotation-schema"
import { buildOverlay } from "./payload-builder"
import { resolveTokenSpan } from "./token-spans"
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

	// Filter tokens for this question
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

	// Build token summaries — index is implicit from array position
	const tokenSummaries = questionTokens.map((t) => ({
		text: t.text_corrected ?? t.text_raw,
		pageOrder: t.page_order,
	}))

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
		tokens: tokenSummaries,
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

	// Resolve token indices to spans and build pending records
	const pending: PendingAnnotation[] = []

	for (let i = 0; i < plan.annotations.length; i++) {
		const item = plan.annotations[i]

		const span = resolveTokenSpan(
			item.anchor_start,
			item.anchor_end,
			questionTokens,
		)
		if (!span) {
			logger.info(TAG, "Invalid token indices — skipping annotation", {
				jobId,
				question_id: gradingResult.question_id,
				anchor_start: item.anchor_start,
				anchor_end: item.anchor_end,
				token_count: questionTokens.length,
			})
			continue
		}

		const overlay = buildOverlay(item)
		if (!overlay) {
			// LLM returned an item missing signal or reason. Schema enforces
			// both as required, so this is belt-and-suspenders — log + drop
			// instead of persisting an empty placeholder (the Q4 bug).
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
			anchorTokenStartId: span.startTokenId,
			anchorTokenEndId: span.endTokenId,
			bbox: span.bbox,
			sortOrder: i,
		})
	}

	return pending
}
