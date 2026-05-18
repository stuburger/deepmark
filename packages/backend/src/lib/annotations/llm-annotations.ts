import { logger } from "@/lib/infra/logger"
import { outputSchema } from "@/lib/infra/output-schema"
import { alignTokensToAnswer } from "@mcp-gcse/shared"
import { generateText } from "ai"
import { buildAnnotationPrompt } from "./annotation-prompt"
import { AnnotationPlanSchema } from "./annotation-schema"
import { labelCleanWords, renderLabeledWords } from "./label-clean-words"
import { buildOverlay } from "./payload-builder"
import { resolveTokenSpanByIds } from "./token-spans"
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

	// Build the labelled clean-words view the LLM uses for anchoring. Each
	// word in `student_answer` is paired with its underlying OCR token via
	// `alignTokensToAnswer` — fuzzy Levenshtein match at runtime. Annotation
	// positioning is approximate; the marker-facing answer text is what the
	// grader read. Crossed-out drafts are excluded from the labelled list
	// entirely so the LLM literally cannot pick them.
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
	const alignment = alignTokensToAnswer(gradingResult.student_answer, pageTokens)
	const { labeled, aliasToTokenId } = labelCleanWords(
		gradingResult.student_answer,
		pageTokens,
		alignment,
	)

	if (labeled.length === 0) {
		logger.info(TAG, "No labelled words available — skipping annotation", {
			jobId,
			question_id: gradingResult.question_id,
		})
		return []
	}

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
		labeledWords: renderLabeledWords(labeled),
		labeledWordCount: labeled.length,
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

		const startTokenId = aliasToTokenId.get(item.anchor_start_token)
		const endTokenId = aliasToTokenId.get(item.anchor_end_token)
		if (!startTokenId || !endTokenId) {
			logger.info(TAG, "Unknown token alias — skipping annotation", {
				jobId,
				question_id: gradingResult.question_id,
				anchor_start_token: item.anchor_start_token,
				anchor_end_token: item.anchor_end_token,
				known_aliases_count: aliasToTokenId.size,
			})
			continue
		}

		const span = resolveTokenSpanByIds(startTokenId, endTokenId, pageTokens)
		if (!span) {
			logger.info(TAG, "Token IDs not found — skipping annotation", {
				jobId,
				question_id: gradingResult.question_id,
				start_token_id: startTokenId,
				end_token_id: endTokenId,
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
