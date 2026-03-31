import { db } from "@/db"
import { logger } from "@/lib/logger"
import { getFileBase64 } from "@/lib/s3"
import type { CorrectedPageToken } from "@/lib/vision-reconcile"
import { GoogleGenAI, Type } from "@google/genai"
import { logStudentPaperEvent } from "@mcp-gcse/db"
import { Resource } from "sst"

const TAG = "vision-attribute"

export type VisionAttributeQuestion = {
	question_id: string
	question_number: string
	question_text: string
	is_mcq: boolean
}

export type VisionAttributePageEntry = {
	key: string
	order: number
	mime_type: string
}

export type VisionAttributeArgs = {
	questions: VisionAttributeQuestion[]
	/** Per-question answer text already extracted by the OCR pass — used as a
	 *  matching anchor so Gemini can locate short/numeric answers (e.g. calculations). */
	extractedAnswers: Array<{ question_id: string; answer_text: string }>
	pages: VisionAttributePageEntry[]
	s3Bucket: string
	jobId: string
	/** Corrected token rows from reconcilePageTokens — must be provided by the
	 *  caller. Attribution does not read tokens from the DB. */
	tokens: CorrectedPageToken[]
}

// Ranges are far more compact than flat index arrays — asking Gemini to list
// every individual index in a 130-word answer produces a huge structured output
// that gets cut off early. A single start/end pair covers the full extent.
// Multiple ranges per question handle non-contiguous blocks (e.g. MCQ answers
// scattered near their question numbers, or mid-page corrections).
const ATTRIBUTION_SCHEMA = {
	type: Type.OBJECT,
	properties: {
		assignments: {
			type: Type.ARRAY,
			description:
				"For each question answered on this page, provide one or more token ranges that cover the full extent of the student's answer",
			items: {
				type: Type.OBJECT,
				properties: {
					question_id: {
						type: Type.STRING,
						description: "The question_id as provided in the question list",
					},
					ranges: {
						type: Type.ARRAY,
						description:
							"Contiguous token ranges for this question's answer. Use multiple ranges if the answer is non-contiguous. Each range is [start, end] inclusive (0-based).",
						items: {
							type: Type.OBJECT,
							properties: {
								start: {
									type: Type.INTEGER,
									description: "First token index (0-based, inclusive)",
								},
								end: {
									type: Type.INTEGER,
									description: "Last token index (0-based, inclusive)",
								},
							},
							required: ["start", "end"],
						},
					},
				},
				required: ["question_id", "ranges"],
			},
		},
	},
	required: ["assignments"],
}

/**
 * Narrows an unknown bbox value to [yMin, xMin, yMax, xMax].
 * Throws if the value is not a 4-element numeric array — a malformed bbox is a
 * data integrity error that must not silently propagate NaN into hull arithmetic.
 */
function parseBbox(
	raw: unknown,
	context: string,
): [number, number, number, number] {
	if (
		!Array.isArray(raw) ||
		raw.length !== 4 ||
		raw.some((v) => typeof v !== "number")
	) {
		throw new Error(`Invalid bbox at ${context}: ${JSON.stringify(raw)}`)
	}
	return raw as [number, number, number, number]
}

/**
 * Computes the bounding-box hull (min/max envelope) of a set of token bboxes.
 * Each bbox is [yMin, xMin, yMax, xMax] normalised 0–1000.
 */
function computeHull(
	bboxes: [number, number, number, number][],
): [number, number, number, number] {
	return [
		Math.min(...bboxes.map((b) => b[0])),
		Math.min(...bboxes.map((b) => b[1])),
		Math.max(...bboxes.map((b) => b[2])),
		Math.max(...bboxes.map((b) => b[3])),
	]
}

/**
 * Replaces Gemini direct bounding-box estimation with a two-step approach:
 *
 * 1. For each page, send the page image + Cloud Vision word tokens + question
 *    list (with pre-extracted answer text as a matching anchor) to Gemini.
 *    Gemini assigns token indices to each question — a semantic grouping task,
 *    not a coordinate-guessing task.
 *
 * 2. Derive answer regions deterministically as the hull of assigned token
 *    bboxes. Because the bboxes come from Cloud Vision they are pixel-precise.
 *
 * Including the image is critical for short/numeric answers (e.g. calculations)
 * where the token text alone is too garbled to match semantically.
 * Including the extracted answer text gives Gemini a direct text-alignment
 * anchor, dramatically improving accuracy.
 *
 * Side-effects:
 * - Updates `question_id` on each assigned `StudentPaperPageToken` row.
 * - Upserts rows in `student_paper_answer_regions` (one per question per page).
 *
 * Runs fire-and-forget — grading is never blocked.
 */
export async function visionAttributeRegions({
	questions,
	extractedAnswers,
	pages,
	s3Bucket,
	jobId,
	tokens,
}: VisionAttributeArgs): Promise<void> {
	if (questions.length === 0) return

	const imagePages = pages.filter((p) => p.mime_type !== "application/pdf")

	if (tokens.length === 0) {
		logger.warn(TAG, "No Vision tokens found — skipping attribution", { jobId })
		return
	}

	// Group tokens by page_order.
	const tokensByPage = new Map<number, CorrectedPageToken[]>()
	for (const t of tokens) {
		const existing = tokensByPage.get(t.page_order) ?? []
		existing.push(t)
		tokensByPage.set(t.page_order, existing)
	}

	const gemini = new GoogleGenAI({ apiKey: Resource.GeminiApiKey.value })

	const questionNumberById = new Map(
		questions.map((q) => [q.question_id, q.question_number]),
	)

	// Build a map of question_id → extracted answer text for the prompt anchor.
	const extractedAnswerById = new Map(
		extractedAnswers
			.filter((a) => a.answer_text.trim())
			.map((a) => [a.question_id, a.answer_text]),
	)

	const questionsText = questions
		.map((q) => {
			const hint = q.is_mcq
				? " [MCQ — look for a circled/ticked letter A/B/C/D]"
				: ""
			const extracted = extractedAnswerById.get(q.question_id)
			// Use up to 600 chars — long essay answers need more context so that
			// the full token span is covered, not just the opening sentences.
			const answerHint = extracted
				? ` | student's extracted answer: "${extracted.slice(0, 600)}"`
				: ""
			return `Q${q.question_number} (id: ${q.question_id})${hint}${answerHint}: ${q.question_text.slice(0, 150)}`
		})
		.join("\n")

	// biome-ignore lint/style/useConst: mutated inside async lambdas
	let totalLocated = 0

	await Promise.all(
		imagePages.map(async (page): Promise<void> => {
			const tokens = tokensByPage.get(page.order) ?? []
			if (tokens.length === 0) return

			// Fetch the page image — including it gives Gemini visual spatial context,
			// which is essential for short or numeric answers where OCR token text alone
			// is too garbled to match to a question reliably.
			let imageBase64: string
			try {
				imageBase64 = await getFileBase64(s3Bucket, page.key)
			} catch (err) {
				logger.error(TAG, "Failed to fetch page image for vision attribution", {
					jobId,
					pageOrder: page.order,
					error: String(err),
				})
				return
			}

			// Build the token list shown to Gemini — use corrected text where available.
			const tokenList = tokens
				.map((t, i) => `${i}: "${t.text_corrected ?? t.text_raw}"`)
				.join("\n")

			const prompt = `You are examining a student's handwritten exam answer script. The image above shows one page of the script.

Below is a list of words (tokens) detected by OCR on this page, numbered 0-based in reading order:
${tokenList}

The exam contains these questions (with the student's already-extracted answer text shown as a matching anchor):
${questionsText}

For each question answered on this page, identify the FULL extent of the student's answer using token ranges [start, end]. 

IMPORTANT:
- Use the image to visually confirm where each answer starts and ends on the page.
- Use the extracted answer text as a matching guide — especially for short/numeric answers where OCR tokens may be garbled.
- For long answers that span many lines, the range end must cover ALL the answer tokens, not just the opening lines. If an answer fills most of the page, the range end should be near the last token.
- Include crossing-out, corrections, and continuation text in the range.
- Use multiple ranges only if an answer is genuinely non-contiguous (e.g. a MCQ letter near its question number).
- Omit questions that have no answer on this page.`

			let response: Awaited<ReturnType<typeof gemini.models.generateContent>>
			try {
				response = await gemini.models.generateContent({
					model: "gemini-2.5-flash",
					contents: [
						{
							role: "user",
							parts: [
								{ inlineData: { data: imageBase64, mimeType: page.mime_type } },
								{ text: prompt },
							],
						},
					],
					config: {
						responseMimeType: "application/json",
						responseSchema: ATTRIBUTION_SCHEMA,
						temperature: 0.1,
					},
				})
			} catch (err) {
				logger.error(TAG, "Gemini attribution call failed for page", {
					jobId,
					pageOrder: page.order,
					error: String(err),
				})
				return
			}

			const responseText = response.candidates?.[0]?.content?.parts?.[0]?.text
			if (!responseText) {
				logger.error(TAG, "Gemini attribution returned no text", {
					jobId,
					pageOrder: page.order,
				})
				return
			}

			type AssignmentResponse = {
				assignments: Array<{
					question_id: string
					ranges: Array<{ start: number; end: number }>
				}>
			}

			let parsed: AssignmentResponse
			try {
				parsed = JSON.parse(responseText) as AssignmentResponse
			} catch {
				logger.error(TAG, "Failed to parse Gemini attribution response", {
					jobId,
					pageOrder: page.order,
				})
				return
			}

			// Expand ranges into individual token indices and validate.
			// parsed.assignments must be an array — if Gemini returned a different
			// shape the per-page catch above already handles the JSON.parse failure.
			const validAssignments = (parsed.assignments ?? [])
				.filter(
					(a) => questionNumberById.has(a.question_id) && a.ranges?.length > 0,
				)
				.map((a) => {
					const indices = a.ranges.flatMap(({ start, end }) => {
						const s = Math.max(0, start)
						const e = Math.min(tokens.length - 1, end)
						return Array.from({ length: e - s + 1 }, (_, i) => s + i)
					})
					return { question_id: a.question_id, token_indices: indices }
				})
				.filter((a) => a.token_indices.length > 0)

			if (validAssignments.length === 0) return

			// 1. Update question_id on assigned token rows.
			await Promise.all(
				validAssignments.flatMap((assignment) =>
					assignment.token_indices.map((idx) => {
						const token = tokens[idx]
						if (!token) return Promise.resolve()
						return db.studentPaperPageToken.update({
							where: { id: token.id },
							data: { question_id: assignment.question_id },
						})
					}),
				),
			)

			// 2. Compute hull for each question from its assigned token bboxes.
			const regionRows = validAssignments.flatMap((assignment) => {
				const assignedBboxes = assignment.token_indices
					.map((idx) => tokens[idx])
					.filter((t): t is CorrectedPageToken => t != null)
					.map((t) => parseBbox(t.bbox, `token ${t.id} (page ${page.order})`))

				if (assignedBboxes.length === 0) return []

				const hull = computeHull(assignedBboxes)

				// questionNumberById.has() above guarantees the key is present.
				const question_number = questionNumberById.get(assignment.question_id)!

				return [
					{
						job_id: jobId,
						question_id: assignment.question_id,
						question_number,
						page_order: page.order,
						box: hull,
						source: null, // Vision token hull — precise coordinates
					},
				]
			})

			if (regionRows.length > 0) {
				await db.studentPaperAnswerRegion.createMany({
					data: regionRows,
					skipDuplicates: true,
				})
				totalLocated += regionRows.length
			}

			logger.info(TAG, "Vision attribution complete for page", {
				jobId,
				pageOrder: page.order,
				questions_located: regionRows.length,
				tokens_assigned: validAssignments.reduce(
					(s, a) => s + a.token_indices.length,
					0,
				),
			})
		}),
	)

	// ── MCQ Gemini fallback ──────────────────────────────────────────────────────
	// MCQ answers are circles/ticks drawn on printed options — Cloud Vision
	// generates no text tokens for them. For any MCQ question that still has no
	// answer region after the main attribution pass, ask Gemini Vision directly.
	const assignedQuestionIds = new Set(
		await db.studentPaperAnswerRegion
			.findMany({
				where: { job_id: jobId },
				select: { question_id: true },
			})
			.then((rows) => rows.map((r) => r.question_id)),
	)

	const unassignedMcqQuestions = questions.filter(
		(q) => q.is_mcq && !assignedQuestionIds.has(q.question_id),
	)

	if (unassignedMcqQuestions.length > 0) {
		logger.info(TAG, "Running Gemini fallback for unassigned MCQ questions", {
			jobId,
			count: unassignedMcqQuestions.length,
			question_numbers: unassignedMcqQuestions.map((q) => q.question_number),
		})

		const fallbackLocated = await runMcqGeminiFallback({
			questions: unassignedMcqQuestions,
			extractedAnswers,
			pages,
			s3Bucket,
			jobId,
			gemini,
		})
		totalLocated += fallbackLocated
	}

	void logStudentPaperEvent(db, jobId, {
		type: "region_attribution_complete",
		at: new Date().toISOString(),
		questions_located: totalLocated,
	})
}

// ── MCQ Gemini fallback ────────────────────────────────────────────────────────

const MCQ_FALLBACK_SCHEMA = {
	type: Type.OBJECT,
	properties: {
		regions: {
			type: Type.ARRAY,
			items: {
				type: Type.OBJECT,
				properties: {
					question_id: { type: Type.STRING },
					box: {
						type: Type.ARRAY,
						description:
							"[yMin, xMin, yMax, xMax] normalised 0–1000 around the selected option",
						items: { type: Type.INTEGER },
					},
					found: { type: Type.BOOLEAN },
				},
				required: ["question_id", "box", "found"],
			},
		},
	},
	required: ["regions"],
}

type McqFallbackArgs = {
	questions: VisionAttributeQuestion[]
	extractedAnswers: Array<{ question_id: string; answer_text: string }>
	pages: VisionAttributePageEntry[]
	s3Bucket: string
	jobId: string
	gemini: GoogleGenAI
}

async function runMcqGeminiFallback({
	questions,
	extractedAnswers,
	pages,
	s3Bucket,
	jobId,
	gemini,
}: McqFallbackArgs): Promise<number> {
	const extractedAnswerById = new Map(
		extractedAnswers.map((a) => [a.question_id, a.answer_text]),
	)
	const questionNumberById = new Map(
		questions.map((q) => [q.question_id, q.question_number]),
	)

	const imagePages = pages.filter((p) => p.mime_type !== "application/pdf")
	let totalLocated = 0

	await Promise.all(
		imagePages.map(async (page): Promise<void> => {
			let imageBase64: string
			try {
				imageBase64 = await getFileBase64(s3Bucket, page.key)
			} catch (err) {
				logger.error(TAG, "Failed to fetch page image for MCQ fallback", {
					jobId,
					pageOrder: page.order,
					error: String(err),
				})
				return
			}

			const questionsText = questions
				.map((q) => {
					const selected = extractedAnswerById.get(q.question_id)
					const hint = selected ? ` — student selected: ${selected}` : ""
					return `Q${q.question_number} (id: ${q.question_id})${hint}`
				})
				.join("\n")

			const prompt = `You are examining a student's handwritten multiple-choice exam script. The image shows one page.

The following MCQ questions may have been answered on this page. The student selected their answer by circling, ticking, or writing next to an option letter:
${questionsText}

For each question answered on this page, draw a tight bounding box around the selected option or written letter. If a question is not answered on this page, set found to false and use [0,0,0,0].

Return bounding box coordinates as [yMin, xMin, yMax, xMax] normalised 0–1000.`

			let response: Awaited<ReturnType<typeof gemini.models.generateContent>>
			try {
				response = await gemini.models.generateContent({
					model: "gemini-2.5-flash",
					contents: [
						{
							role: "user",
							parts: [
								{ inlineData: { data: imageBase64, mimeType: page.mime_type } },
								{ text: prompt },
							],
						},
					],
					config: {
						responseMimeType: "application/json",
						responseSchema: MCQ_FALLBACK_SCHEMA,
						temperature: 0.1,
					},
				})
			} catch (err) {
				logger.error(TAG, "Gemini MCQ fallback call failed", {
					jobId,
					pageOrder: page.order,
					error: String(err),
				})
				return
			}

			const responseText = response.candidates?.[0]?.content?.parts?.[0]?.text
			if (!responseText) {
				logger.error(TAG, "Gemini MCQ fallback returned no text", {
					jobId,
					pageOrder: page.order,
				})
				return
			}

			type FallbackResponse = {
				regions: Array<{
					question_id: string
					box: [number, number, number, number]
					found: boolean
				}>
			}

			let parsed: FallbackResponse
			try {
				parsed = JSON.parse(responseText) as FallbackResponse
			} catch {
				logger.error(TAG, "Failed to parse MCQ fallback response", {
					jobId,
					pageOrder: page.order,
				})
				return
			}

			const found = (parsed.regions ?? []).filter(
				(r) =>
					r.found &&
					questionNumberById.has(r.question_id) &&
					r.box.some((v) => v > 0),
			)

			if (found.length === 0) return

			// questionNumberById.has() above guarantees the key is present.
			await db.studentPaperAnswerRegion.createMany({
				data: found.map((r) => ({
					job_id: jobId,
					question_id: r.question_id,
					question_number: questionNumberById.get(r.question_id)!,
					page_order: page.order,
					box: r.box,
					source: "gemini_fallback",
				})),
				skipDuplicates: true,
			})

			totalLocated += found.length

			logger.info(TAG, "MCQ Gemini fallback complete for page", {
				jobId,
				pageOrder: page.order,
				found: found.length,
			})
		}),
	)

	return totalLocated
}
