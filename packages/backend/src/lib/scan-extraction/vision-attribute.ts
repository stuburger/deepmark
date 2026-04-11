import { db } from "@/db"
import { callLlmWithFallback } from "@/lib/infra/llm-runtime"
import { logger } from "@/lib/infra/logger"
import { getFileBase64 } from "@/lib/infra/s3"
import { filterSpatialOutliers } from "@/lib/scan-extraction/filter-spatial-outliers"
import type { CorrectedPageToken } from "@/lib/scan-extraction/vision-reconcile"
import { logOcrRunEvent } from "@mcp-gcse/db"
import { type LlmRunner, computeBboxHull } from "@mcp-gcse/shared"
import { generateText } from "ai"
import { outputSchema } from "@/lib/infra/output-schema"
import {
	AttributionSchema,
	McqFallbackSchema,
	buildAttributionPrompt,
	buildMcqFallbackPrompt,
} from "./vision-attribute-prompt"

const TAG = "vision-attribute"

class AttributionError extends Error {
	constructor(
		message: string,
		readonly pageOrder: number,
		readonly reason: string,
		readonly detail?: string,
	) {
		super(message)
		this.name = "AttributionError"
	}
}

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
	 *  matching anchor so the LLM can locate short/numeric answers (e.g. calculations). */
	extractedAnswers: Array<{ question_id: string; answer_text: string }>
	pages: VisionAttributePageEntry[]
	s3Bucket: string
	jobId: string
	/** Corrected token rows from reconcilePageTokens — must be provided by the
	 *  caller. Attribution does not read tokens from the DB. */
	tokens: CorrectedPageToken[]
	llm?: LlmRunner
}

/**
 * Narrows an unknown bbox value to [yMin, xMin, yMax, xMax].
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
 * Two-step vision attribution:
 * 1. Send page image + Cloud Vision tokens + questions to LLM — assigns token ranges to questions.
 * 2. Derive answer regions deterministically as the hull of assigned token bboxes.
 *
 * Side-effects:
 * - Updates `question_id` on each assigned `StudentPaperPageToken` row.
 * - Upserts rows in `student_paper_answer_regions` (one per question per page).
 */
export async function visionAttributeRegions({
	questions,
	extractedAnswers,
	pages,
	s3Bucket,
	jobId,
	tokens,
	llm,
}: VisionAttributeArgs): Promise<void> {
	if (questions.length === 0) return

	const imagePages = pages.filter((p) => p.mime_type !== "application/pdf")

	if (tokens.length === 0) {
		logger.warn(TAG, "No Vision tokens found — skipping attribution", {
			jobId,
		})
		return
	}

	// Group tokens by page_order.
	const tokensByPage = new Map<number, CorrectedPageToken[]>()
	for (const t of tokens) {
		const existing = tokensByPage.get(t.page_order) ?? []
		existing.push(t)
		tokensByPage.set(t.page_order, existing)
	}

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
			const answerHint = extracted
				? ` | student's extracted answer: "${extracted}"`
				: ""
			return `Q${q.question_number} (id: ${q.question_id})${hint}${answerHint}: ${q.question_text}`
		})
		.join("\n")

	let totalLocated = 0

	await Promise.all(
		imagePages.map(async (page): Promise<void> => {
			const tokens = tokensByPage.get(page.order) ?? []
			if (tokens.length === 0) return

			let imageBase64: string
			try {
				imageBase64 = await getFileBase64(s3Bucket, page.key)
			} catch (err) {
				void logOcrRunEvent(db, jobId, {
					type: "region_attribution_failed",
					at: new Date().toISOString(),
					page_order: page.order,
					reason: "image_fetch_failed",
					detail: String(err),
				})
				throw new AttributionError(
					`Failed to fetch page image for vision attribution (page ${page.order})`,
					page.order,
					"image_fetch_failed",
					String(err),
				)
			}

			// Build the token list shown to the LLM — use corrected text where available.
			const tokenList = tokens
				.map((t, i) => `${i}: "${t.text_corrected ?? t.text_raw}"`)
				.join("\n")

			const prompt = buildAttributionPrompt(tokenList, questionsText)

			let parsed: {
				assignments: Array<{
					question_id: string
					ranges: Array<{ start: number; end: number }>
				}>
			}
			try {
				const { output } = await callLlmWithFallback(
					"vision-attribution",
					async (model, entry, report) => {
						const result = await generateText({
							model,
							temperature: entry.temperature,
							messages: [
								{
									role: "user",
									content: [
										{
											type: "image",
											image: imageBase64,
											mediaType: page.mime_type,
										},
										{ type: "text", text: prompt },
									],
								},
							],
							output: outputSchema(AttributionSchema),
						})
						report.usage = result.usage
						return result
					},
					llm,
				)
				parsed = output
			} catch (err) {
				void logOcrRunEvent(db, jobId, {
					type: "region_attribution_failed",
					at: new Date().toISOString(),
					page_order: page.order,
					reason: "llm_call_failed",
					detail: String(err),
				})
				throw new AttributionError(
					`LLM attribution call failed for page ${page.order}`,
					page.order,
					"llm_call_failed",
					String(err),
				)
			}

			// Expand ranges into individual token indices and validate.
			const rawAssignments = parsed.assignments ?? []
			const validAssignments = rawAssignments
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

			if (validAssignments.length === 0) {
				if (rawAssignments.length > 0) {
					const returnedIds = rawAssignments.map((a) => a.question_id)
					const expectedIds = [...questionNumberById.keys()]
					void logOcrRunEvent(db, jobId, {
						type: "region_attribution_failed",
						at: new Date().toISOString(),
						page_order: page.order,
						reason: "no_valid_assignments",
						detail: `LLM returned ${rawAssignments.length} assignment(s) but none matched known question IDs. Returned: [${returnedIds.join(", ")}]. Expected: [${expectedIds.join(", ")}]`,
					})
					throw new AttributionError(
						`LLM attribution returned ${rawAssignments.length} assignment(s) for page ${page.order} but none matched known question IDs`,
						page.order,
						"no_valid_assignments",
						`Returned IDs: [${returnedIds.join(", ")}]`,
					)
				}
				return
			}

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
			// Filter spatial outliers first — a single misattributed token can
			// stretch the hull across the entire page (see Q01.7 overlap bug).
			const regionRows = validAssignments.flatMap((assignment) => {
				const assignedBboxes = assignment.token_indices
					.map((idx) => tokens[idx])
					.filter((t): t is CorrectedPageToken => t != null)
					.map((t) => parseBbox(t.bbox, `token ${t.id} (page ${page.order})`))

				if (assignedBboxes.length === 0) return []

				const filteredBboxes = filterSpatialOutliers(assignedBboxes)
				if (filteredBboxes.length === 0) return []

				const hull = computeBboxHull(filteredBboxes)
				// biome-ignore lint/style/noNonNullAssertion: question_id guaranteed in map from earlier query
				const question_number = questionNumberById.get(assignment.question_id)!

				return [
					{
						submission_id: jobId,
						question_id: assignment.question_id,
						question_number,
						page_order: page.order,
						box: hull,
						source: null,
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

	// ── MCQ fallback ──────────────────────────────────────────────────────
	const assignedQuestionIds = new Set(
		await db.studentPaperAnswerRegion
			.findMany({
				where: { submission_id: jobId },
				select: { question_id: true },
			})
			.then((rows) => rows.map((r) => r.question_id)),
	)

	const unassignedMcqQuestions = questions.filter(
		(q) => q.is_mcq && !assignedQuestionIds.has(q.question_id),
	)

	if (unassignedMcqQuestions.length > 0) {
		logger.info(TAG, "Running LLM fallback for unassigned MCQ questions", {
			jobId,
			count: unassignedMcqQuestions.length,
			question_numbers: unassignedMcqQuestions.map((q) => q.question_number),
		})

		const fallbackLocated = await runMcqFallback({
			questions: unassignedMcqQuestions,
			extractedAnswers,
			pages,
			s3Bucket,
			jobId,
			llm,
		})
		totalLocated += fallbackLocated
	}

	void logOcrRunEvent(db, jobId, {
		type: "region_attribution_complete",
		at: new Date().toISOString(),
		questions_located: totalLocated,
	})
}

// ── MCQ fallback ────────────────────────────────────────────────────────

type McqFallbackArgs = {
	questions: VisionAttributeQuestion[]
	extractedAnswers: Array<{ question_id: string; answer_text: string }>
	pages: VisionAttributePageEntry[]
	s3Bucket: string
	jobId: string
	llm?: LlmRunner
}

async function runMcqFallback({
	questions,
	extractedAnswers,
	pages,
	s3Bucket,
	jobId,
	llm,
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

			const prompt = buildMcqFallbackPrompt(questionsText)

			try {
				const { output: parsed } = await callLlmWithFallback(
					"vision-attribution-mcq-fallback",
					async (model, entry, report) => {
						const result = await generateText({
							model,
							temperature: entry.temperature,
							messages: [
								{
									role: "user",
									content: [
										{
											type: "image",
											image: imageBase64,
											mediaType: page.mime_type,
										},
										{ type: "text", text: prompt },
									],
								},
							],
							output: outputSchema(McqFallbackSchema),
						})
						report.usage = result.usage
						return result
					},
					llm,
				)

				const found = (parsed.regions ?? []).filter(
					(r) =>
						r.found &&
						questionNumberById.has(r.question_id) &&
						r.box.some((v) => v > 0),
				)

				if (found.length === 0) return

				await db.studentPaperAnswerRegion.createMany({
					data: found.map((r) => ({
						submission_id: jobId,
						question_id: r.question_id,
						// biome-ignore lint/style/noNonNullAssertion: question_id guaranteed in map from earlier query
						question_number: questionNumberById.get(r.question_id)!,
						page_order: page.order,
						box: r.box,
						source: "gemini_fallback",
					})),
					skipDuplicates: true,
				})

				totalLocated += found.length

				logger.info(TAG, "MCQ LLM fallback complete for page", {
					jobId,
					pageOrder: page.order,
					found: found.length,
				})
			} catch (err) {
				logger.error(TAG, "LLM MCQ fallback call failed", {
					jobId,
					pageOrder: page.order,
					error: String(err),
				})
			}
		}),
	)

	return totalLocated
}
