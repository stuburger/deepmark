import { defaultChatModel } from "@/lib/infra/google-generative-ai"
import { logger } from "@/lib/infra/logger"
import type { QuestionListItem } from "@/lib/grading/question-list"
import { Output, generateText } from "ai"
import { AlignmentSchema, buildAlignmentPrompt } from "./answer-alignment-prompt"

const TAG = "answer-alignment"

/**
 * Normalise question numbers for comparison.
 * Strips a leading "Q"/"q", all whitespace, all dots, and lowercases — so
 * "Q1a", "1 a", "1A", "0.1.1", "01.1", "0.01" all collapse to a comparable
 * form before any lookup is attempted.
 */
export function normaliseQNum(s: string): string {
	return s.replace(/^q/i, "").replace(/[\s.]/g, "").toLowerCase()
}


export type AlignAnswersWithLlmArgs = {
	unmatchedQuestions: Array<{
		question_id: string
		question_number: string
		question_text: string
		question_type: string
	}>
	allOcrAnswers: Array<{ question_number: string; answer_text: string }>
	jobId: string
}

/**
 * LLM fallback: aligns OCR-extracted answers to exam questions when
 * normalised string matching fails (e.g. OCR reads "0.1.2" for "01.2").
 *
 * Called when at least one question has no normalised match and there are
 * unconsumed OCR answers — one LLM call aligns all such questions (no
 * positional zip; order of pages in the scan does not need to match exam order).
 */
export async function alignAnswersWithLlm(
	args: AlignAnswersWithLlmArgs,
): Promise<Map<string, string>> {
	const { unmatchedQuestions, allOcrAnswers, jobId } = args
	const result = new Map<string, string>()

	const questionsText = unmatchedQuestions
		.map(
			(q) =>
				`- id: ${q.question_id} | number: ${q.question_number} | type: ${q.question_type} | text: ${q.question_text}`,
		)
		.join("\n")

	const answersText = allOcrAnswers
		.map(
			(a) =>
				`- ocr_number: ${a.question_number} | answer: ${a.answer_text || "(blank)"}`,
		)
		.join("\n")

	const prompt = buildAlignmentPrompt(questionsText, answersText)

	try {
		const { output } = await generateText({
			model: defaultChatModel(),
			messages: [{ role: "user", content: prompt }],
			output: Output.object({ schema: AlignmentSchema }),
		})

		for (const alignment of output.alignments) {
			result.set(alignment.question_id, alignment.answer_text)
		}
	} catch (err) {
		logger.error(
			TAG,
			"LLM alignment failed — unmatched questions will receive empty answers",
			{ jobId, error: String(err) },
		)
	}

	return result
}

export type AlignAnswersArgs = {
	questionList: QuestionListItem[]
	rawAnswers: Array<{ question_number: string; answer_text: string }>
	jobId: string
}

export type AlignAnswersResult = {
	answerMap: Map<string, string>
	llmAlignmentMap: Map<string, string>
}

/**
 * Two-pass answer alignment:
 *  Pass 1 — normalised string match (strips Q-prefix, dots, whitespace).
 *  Pass 2 — LLM fallback for any questions still unmatched after pass 1.
 */
export async function alignAnswers(
	args: AlignAnswersArgs,
): Promise<AlignAnswersResult> {
	const { questionList, rawAnswers, jobId } = args

	const answerMap = new Map<string, string>()
	for (const a of rawAnswers) {
		answerMap.set(normaliseQNum(a.question_number), a.answer_text)
	}

	const unmatchedQuestions = questionList.filter(
		(q) => !answerMap.has(normaliseQNum(q.question_number)),
	)

	const matchedNormKeys = new Set(
		questionList
			.map((q) => normaliseQNum(q.question_number))
			.filter((normKey) => answerMap.has(normKey)),
	)

	const unusedAnswers = rawAnswers.filter(
		(a) => !matchedNormKeys.has(normaliseQNum(a.question_number)),
	)

	let llmAlignmentMap = new Map<string, string>()
	if (unmatchedQuestions.length > 0 && unusedAnswers.length > 0) {
		logger.info(TAG, "Triggering LLM alignment fallback", {
			jobId,
			unmatched_questions: unmatchedQuestions.length,
			unused_ocr_answers: unusedAnswers.length,
		})
		llmAlignmentMap = await alignAnswersWithLlm({
			unmatchedQuestions: unmatchedQuestions.map((q) => ({
				question_id: q.question_id,
				question_number: q.question_number,
				question_text: q.question_text,
				question_type: q.question_obj.question_type,
			})),
			allOcrAnswers: rawAnswers,
			jobId,
		})
		logger.info(TAG, "LLM alignment complete", {
			jobId,
			aligned_count: llmAlignmentMap.size,
		})
	}

	const stillEmptyUnmatched = unmatchedQuestions.filter((q) => {
		const t = llmAlignmentMap.get(q.question_id)
		if (t === undefined) return true
		return t.trim() === ""
	}).length

	logger.info(TAG, "Grading using pre-extracted answers", {
		jobId,
		normalised_matched: answerMap.size - unmatchedQuestions.length,
		llm_aligned: llmAlignmentMap.size,
		still_empty: stillEmptyUnmatched,
	})

	return { answerMap, llmAlignmentMap }
}
