import { type HandwritingAnalysis, runOcr } from "@/lib/gemini-ocr"
import { logger } from "@/lib/logger"
import { GoogleGenAI, Type } from "@google/genai"
import { Resource } from "sst"

const TAG = "gemini-extract"

export type PageMimeType =
	| "application/pdf"
	| "image/jpeg"
	| "image/png"
	| "image/webp"
	| "image/heic"

export type PageData = {
	/** base64-encoded file content */
	data: string
	mimeType: PageMimeType
}

/**
 * A question seed supplied to the extraction model so it can return canonical
 * question_id values rather than OCR-derived question numbers.
 */
export type QuestionSeed = {
	question_id: string
	question_number: string
	question_text: string
	question_type: string
}

export type StudentPaperExtraction = {
	studentName: string | null
	detectedSubject: string | null
	/** Keyed by canonical question_id — every seed question is present. */
	answers: Array<{ question_id: string; answer_text: string }>
	/** Per-page OCR results in the same order as the input pageData array. */
	ocrResults: HandwritingAnalysis[]
}

const STUDENT_PAPER_SCHEMA = {
	type: Type.OBJECT,
	properties: {
		student_name: { type: Type.STRING, nullable: true },
		detected_subject: { type: Type.STRING, nullable: true },
		answers: {
			type: Type.ARRAY,
			items: {
				type: Type.OBJECT,
				properties: {
					question_id: { type: Type.STRING },
					answer_text: { type: Type.STRING },
				},
				required: ["question_id", "answer_text"],
			},
		},
	},
	required: ["answers"],
}

function buildExtractionPrompt(
	pageCount: number,
	questions: QuestionSeed[],
): string {
	const questionLines = questions
		.map((q) => {
			const typeHint =
				q.question_type === "multiple_choice" ? "multiple_choice" : "written"
			return `[id:${q.question_id}] ${q.question_number} (${typeHint}): ${q.question_text}`
		})
		.join("\n")

	return `This is a student's handwritten exam answer sheet (${pageCount} page${pageCount > 1 ? "s" : ""}).

This exam paper contains exactly the following questions:
${questionLines}

Extract the student's answer for EVERY question listed above.

Rules:
- For multiple_choice questions: output ONLY the single letter (A, B, C, or D) the student circled, ticked, or wrote — nothing else. Do not include the surrounding text.
- For written/calculation questions: transcribe the full handwritten text verbatim.
- The student may have used different question numbers or a simple numbered list (e.g. "1)", "2)") — match their answers to the correct question_id based on position and context, not just the label they used.
- Use "" (empty string) if no answer is visible for a question.
- Return question_id exactly as shown in [id:...] — every question must appear exactly once in the output.

Also:
1. Extract the student's name if visible on any page.
2. Detect the subject (e.g. biology, business, mathematics) from headers or content.

Return:
- student_name: the student's name (null if not found)
- detected_subject: the detected subject as a lowercase single word (null if unclear)
- answers: array of { question_id, answer_text } — one entry per question above`
}

/**
 * Calls Gemini to extract the student's name, detected subject, and answers
 * from one or more base64-encoded exam pages.
 *
 * Requires a list of question seeds so the model returns canonical question_id
 * values rather than OCR-derived question numbers. Every seed question is
 * guaranteed to appear in the returned answers array (missing entries are
 * filled with an empty string).
 *
 * Per-page OCR (transcript + bounding boxes via runOcr) runs concurrently
 * with the extraction call so no latency is added.
 *
 * Throws if Gemini returns an empty response.
 */
export async function extractStudentPaper(
	pageData: PageData[],
	questions: QuestionSeed[],
): Promise<StudentPaperExtraction> {
	const gemini = new GoogleGenAI({ apiKey: Resource.GeminiApiKey.value })

	const inlineDataParts = pageData.map((p) => ({
		inlineData: { data: p.data, mimeType: p.mimeType },
	}))

	// Fan out: answer extraction (all pages combined) + per-page runOcr in parallel.
	// runOcr itself makes 2 parallel Gemini calls (transcript + bounding boxes).
	const [response, ...ocrResults] = await Promise.all([
		gemini.models.generateContent({
			model: "gemini-2.5-flash",
			contents: [
				{
					role: "user",
					parts: [
						...inlineDataParts,
						{ text: buildExtractionPrompt(pageData.length, questions) },
					],
				},
			],
			config: {
				responseMimeType: "application/json",
				responseSchema: STUDENT_PAPER_SCHEMA,
				temperature: 0.1,
			},
		}),
		...pageData.map((p) => runOcr(p.data, p.mimeType)),
	])

	const responseText = response.text
	if (!responseText) throw new Error("No response from Gemini")

	const parsed = JSON.parse(responseText) as {
		student_name?: string | null
		detected_subject?: string | null
		answers: Array<{ question_id: string; answer_text: string }>
	}

	const answers = validateAndFillAnswers(parsed.answers ?? [], questions)

	return {
		studentName: parsed.student_name ?? null,
		detectedSubject: parsed.detected_subject ?? null,
		answers,
		ocrResults,
	}
}

/**
 * Ensures every question seed has a corresponding answer entry.
 * - Missing question_ids are added with answer_text "".
 * - Unexpected question_ids (not in the seed list) are dropped with a warning.
 */
function validateAndFillAnswers(
	modelAnswers: Array<{ question_id: string; answer_text: string }>,
	questions: QuestionSeed[],
): Array<{ question_id: string; answer_text: string }> {
	const expectedIds = new Set(questions.map((q) => q.question_id))
	const answeredIds = new Set(modelAnswers.map((a) => a.question_id))

	const unexpected = modelAnswers.filter((a) => !expectedIds.has(a.question_id))
	if (unexpected.length > 0) {
		logger.warn(TAG, "Model returned unexpected question_ids — dropping", {
			unexpected_ids: unexpected.map((a) => a.question_id),
		})
	}

	const missing = questions.filter((q) => !answeredIds.has(q.question_id))
	if (missing.length > 0) {
		logger.warn(TAG, "Model omitted question_ids — filling with empty answer", {
			missing_count: missing.length,
			missing_numbers: missing.map((q) => q.question_number),
		})
	}

	const validAnswers = modelAnswers.filter((a) =>
		expectedIds.has(a.question_id),
	)
	const filledAnswers = missing.map((q) => ({
		question_id: q.question_id,
		answer_text: "",
	}))

	return [...validAnswers, ...filledAnswers]
}
