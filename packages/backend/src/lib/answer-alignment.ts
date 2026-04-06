import { defaultChatModel } from "@/lib/google-generative-ai"
import { logger } from "@/lib/logger"
import type { QuestionListItem } from "@/lib/question-list"
import { Output, generateText } from "ai"
import { z } from "zod"

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

const AlignmentSchema = z.object({
	alignments: z.array(
		z.object({
			question_id: z.string(),
			answer_text: z.string(),
		}),
	),
})

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

	const prompt = `You are aligning a student's OCR-extracted answers to the correct exam questions.
The OCR may have misread question numbers (e.g. "0.1.2" instead of "01.2", "0.01" instead of "01.1").
Scan pages may have been photographed or uploaded out of order — do not assume the list order of OCR answers matches exam question order.

EXAM QUESTIONS THAT NEED ANSWERS (currently unmatched):
${questionsText}

ALL OCR-EXTRACTED ANSWERS (including already-matched ones for context):
${answersText}

For each unmatched exam question, identify the most likely student answer from the OCR outputs.
Consider: question number similarity, answer content matching question type (A/B/C/D for MCQ, text for written).
If a question genuinely has no student answer, use an empty string "".
Return the alignments array strictly matching the schema.`

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
