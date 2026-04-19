import { db } from "@/db"
import { callLlmWithFallback } from "@/lib/infra/llm-runtime"
import { logger } from "@/lib/infra/logger"
import { outputSchema } from "@/lib/infra/output-schema"
import { getFileBase64 } from "@/lib/infra/s3"
import { logOcrRunEvent } from "@mcp-gcse/db"
import {
	type LlmRunner,
	computeBboxHull,
	sortTokensSpatially,
} from "@mcp-gcse/shared"
import { generateText } from "ai"
import {
	type PagePromptBlock,
	type ScriptAttributionOutput,
	ScriptAttributionSchema,
	buildScriptAttributionPrompt,
} from "./attribute-script-prompt"
import type { ReconstructedAnswer } from "./reconstruct-answers"

const TAG = "attribute-script"

const MAX_ATTEMPTS = 2

export type AttributeScriptQuestion = {
	question_id: string
	question_number: string
	question_text: string
	is_mcq: boolean
}

export type AttributeScriptPage = {
	key: string
	order: number
	mime_type: string
}

/** Raw token row as returned from the persist-tokens DB insert. */
export type PageToken = {
	id: string
	page_order: number
	para_index: number
	line_index: number
	word_index: number
	text_raw: string
	bbox: unknown
}

/**
 * Args for the script-level attribution pipeline.
 *
 * Reasons about the WHOLE script at once — no per-page amnesia, no hint
 * band-aids. Continuation pages, cover pages, and dense multi-answer pages
 * are all handled by the same holistic pass.
 */
export type AttributeScriptArgs = {
	questions: AttributeScriptQuestion[]
	pages: AttributeScriptPage[]
	s3Bucket: string
	jobId: string
	/** Token rows from the DB insert. Attribution does not re-read from DB. */
	tokens: PageToken[]
	/** Optional per-page OCR transcripts. Used as a semantic aid, not a
	 *  candidate shortlist — the model reasons about content itself. */
	pageTranscripts?: Map<number, string>
	llm?: LlmRunner
}

class ScriptAttributionError extends Error {
	constructor(
		message: string,
		readonly reason: string,
		readonly detail?: string,
	) {
		super(message)
		this.name = "ScriptAttributionError"
	}
}

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
 * Validates the LLM's answer_spans output. Returns an array of human-readable
 * error strings — empty means valid. Out-of-range indices are NOT errors:
 * they're filtered silently by the Phase 2 fill. Overlap is — it means two
 * questions are fighting for the same token, which is the failure mode we
 * explicitly retry on.
 */
function validateAnswerSpans(
	output: ScriptAttributionOutput,
	tokensByPage: Map<number, PageToken[]>,
	validQuestionIds: Set<string>,
): string[] {
	const errors: string[] = []
	type Range = { qid: string; start: number; end: number }
	const rangesByPage = new Map<number, Range[]>()

	for (const span of output.answer_spans ?? []) {
		if (!validQuestionIds.has(span.question_id)) continue
		for (const page of span.pages ?? []) {
			const pagePts = tokensByPage.get(page.page)
			if (!pagePts) {
				errors.push(
					`Q(${span.question_id}): returned range for page ${page.page} but no tokens exist on that page`,
				)
				continue
			}
			if (
				!Number.isInteger(page.token_start) ||
				!Number.isInteger(page.token_end)
			) {
				errors.push(
					`Q(${span.question_id}) page ${page.page}: token_start/token_end must be integers (got ${page.token_start},${page.token_end})`,
				)
				continue
			}
			if (page.token_end <= page.token_start) {
				errors.push(
					`Q(${span.question_id}) page ${page.page}: empty/reversed range [${page.token_start},${page.token_end})`,
				)
				continue
			}
			const list = rangesByPage.get(page.page) ?? []
			list.push({
				qid: span.question_id,
				start: page.token_start,
				end: page.token_end,
			})
			rangesByPage.set(page.page, list)
		}
	}

	for (const [pageOrder, list] of rangesByPage) {
		const sorted = [...list].sort((a, b) => a.start - b.start)
		for (let i = 1; i < sorted.length; i++) {
			const prev = sorted[i - 1]
			const curr = sorted[i]
			if (prev && curr && curr.start < prev.end) {
				errors.push(
					`Page ${pageOrder}: ranges overlap — Q(${prev.qid}) [${prev.start},${prev.end}) and Q(${curr.qid}) [${curr.start},${curr.end}). Each token on a page may belong to at most one question.`,
				)
			}
		}
	}

	return errors
}

/**
 * Script-level answer attribution.
 *
 * Single cross-page LLM call: takes ALL page images + ALL tokens + ALL
 * questions, returns per-question, per-page token-index ranges. Phase 2
 * deterministically fills `question_id` on each token row inside an assigned
 * range and upserts `student_paper_answer_regions` as the bbox hull of those
 * tokens.
 *
 * Returns `{ answers }` — one entry per input question, `answer_text` is the
 * LLM's clean punctuation-preserving reading of the student's answer (or "" if
 * unanswered). Callers use this directly for grading; token-derived answer
 * text is no longer needed.
 *
 * Contract (enforced by the eval suite):
 *  - Every token ends up attributed to exactly one question, or null.
 *  - Attribution decisions use cross-page context — mid-sentence continuation
 *    pages inherit the currently-open question semantically.
 *  - No spurious attribution on cover/template pages (tokens there stay null).
 *  - Dense multi-answer pages produce non-overlapping boundaries.
 */
export async function attributeScript({
	questions,
	pages,
	s3Bucket,
	jobId,
	tokens,
	pageTranscripts,
	llm,
}: AttributeScriptArgs): Promise<{ answers: ReconstructedAnswer[] }> {
	const emptyAnswers: ReconstructedAnswer[] = questions.map((q) => ({
		question_id: q.question_id,
		answer_text: "",
	}))

	if (questions.length === 0) return { answers: emptyAnswers }

	const imagePages = pages
		.filter((p) => p.mime_type !== "application/pdf")
		.sort((a, b) => a.order - b.order)

	if (imagePages.length === 0) {
		logger.warn(TAG, "No image pages available — skipping attribution", {
			jobId,
		})
		return { answers: emptyAnswers }
	}

	if (tokens.length === 0) {
		logger.warn(TAG, "No Vision tokens found — skipping attribution", { jobId })
		return { answers: emptyAnswers }
	}

	// ── 1. Group + spatial-sort tokens per page (reading order) ───────────
	const tokensByPage = new Map<number, PageToken[]>()
	for (const t of tokens) {
		const list = tokensByPage.get(t.page_order) ?? []
		list.push(t)
		tokensByPage.set(t.page_order, list)
	}
	const orderedTokensByPage = new Map<number, PageToken[]>()
	for (const [order, list] of tokensByPage) {
		orderedTokensByPage.set(order, sortTokensSpatially(list))
	}

	const validQuestionIds = new Set(questions.map((q) => q.question_id))
	const questionNumberById = new Map(
		questions.map((q) => [q.question_id, q.question_number]),
	)

	// ── 2. Fetch all page images in parallel ──────────────────────────────
	const imagesByPage = new Map<number, string>()
	try {
		await Promise.all(
			imagePages.map(async (p) => {
				imagesByPage.set(p.order, await getFileBase64(s3Bucket, p.key))
			}),
		)
	} catch (err) {
		void logOcrRunEvent(db, jobId, {
			type: "region_attribution_failed",
			at: new Date().toISOString(),
			page_order: -1,
			reason: "image_fetch_failed",
			detail: String(err),
		})
		throw new ScriptAttributionError(
			"Failed to fetch page images for script attribution",
			"image_fetch_failed",
			String(err),
		)
	}

	// ── 3. Build per-page prompt blocks ───────────────────────────────────
	const pageBlocks: PagePromptBlock[] = imagePages.map((p) => {
		const pts = orderedTokensByPage.get(p.order) ?? []
		const tokenList = pts.map((t, i) => `[${i},"${t.text_raw}"]`).join(",")
		return {
			order: p.order,
			tokenList,
			transcript: pageTranscripts?.get(p.order) ?? "",
		}
	})

	const questionsText = questions
		.map(
			(q) =>
				`Q${q.question_number} (id: ${q.question_id})${q.is_mcq ? " [multiple-choice — written answer unusual]" : ""}: ${q.question_text}`,
		)
		.join("\n")

	// ── 4. LLM call with validation + retry ───────────────────────────────
	let parsed: ScriptAttributionOutput | null = null
	let retryFeedback: string | undefined

	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		const prompt = buildScriptAttributionPrompt({
			pageBlocks,
			questionsText,
			retryFeedback,
		})

		let output: ScriptAttributionOutput
		try {
			const { output: rawOutput } = await callLlmWithFallback(
				"script-attribution",
				async (model, entry, report) => {
					const result = await generateText({
						model,
						temperature: entry.temperature,
						messages: [
							{
								role: "user",
								content: [
									...imagePages.map((p) => ({
										type: "image" as const,
										// biome-ignore lint/style/noNonNullAssertion: guaranteed populated above
										image: imagesByPage.get(p.order)!,
										mediaType: p.mime_type,
									})),
									{ type: "text" as const, text: prompt },
								],
							},
						],
						output: outputSchema(ScriptAttributionSchema),
					})
					report.usage = result.usage
					return result
				},
				llm,
			)
			output = rawOutput
		} catch (err) {
			void logOcrRunEvent(db, jobId, {
				type: "region_attribution_failed",
				at: new Date().toISOString(),
				page_order: -1,
				reason: "llm_call_failed",
				detail: String(err),
			})
			throw new ScriptAttributionError(
				"Script-level attribution LLM call failed",
				"llm_call_failed",
				String(err),
			)
		}

		const errors = validateAnswerSpans(
			output,
			orderedTokensByPage,
			validQuestionIds,
		)
		if (errors.length === 0) {
			parsed = output
			break
		}

		logger.warn(TAG, "Attribution output failed validation", {
			jobId,
			attempt,
			errors,
		})

		if (attempt === MAX_ATTEMPTS) {
			void logOcrRunEvent(db, jobId, {
				type: "region_attribution_failed",
				at: new Date().toISOString(),
				page_order: -1,
				reason: "validation_failed",
				detail: errors.join("; "),
			})
			throw new ScriptAttributionError(
				`Script attribution output invalid after ${MAX_ATTEMPTS} attempts: ${errors.join("; ")}`,
				"validation_failed",
				errors.join("; "),
			)
		}
		retryFeedback = errors.map((e) => `- ${e}`).join("\n")
	}

	if (!parsed) {
		// Unreachable — loop either sets `parsed` or throws.
		throw new ScriptAttributionError(
			"Attribution produced no parsed output",
			"no_output",
		)
	}

	// ── 5. Phase 2 — deterministic fill ───────────────────────────────────
	// Per (page, question) → token indices inside the assigned ranges.
	type PageQuestionAssignment = { questionId: string; tokenIndices: number[] }
	const assignmentsByPage = new Map<number, PageQuestionAssignment[]>()

	for (const span of parsed.answer_spans) {
		if (!validQuestionIds.has(span.question_id)) continue
		for (const pageSpan of span.pages) {
			const pagePts = orderedTokensByPage.get(pageSpan.page)
			if (!pagePts) continue
			const start = Math.max(0, Math.min(pagePts.length, pageSpan.token_start))
			const end = Math.max(0, Math.min(pagePts.length, pageSpan.token_end))
			if (end <= start) continue
			const indices: number[] = []
			for (let i = start; i < end; i++) indices.push(i)
			const list = assignmentsByPage.get(pageSpan.page) ?? []
			list.push({ questionId: span.question_id, tokenIndices: indices })
			assignmentsByPage.set(pageSpan.page, list)
		}
	}

	// ── 6. Persist token question_id + text_corrected ─────────────────────
	const tokenUpdates: Promise<unknown>[] = []
	let tokensAssigned = 0
	for (const [pageOrder, assignments] of assignmentsByPage) {
		const pagePts = orderedTokensByPage.get(pageOrder) ?? []
		for (const a of assignments) {
			for (const idx of a.tokenIndices) {
				const token = pagePts[idx]
				if (!token) continue
				tokensAssigned += 1
				tokenUpdates.push(
					db.studentPaperPageToken.update({
						where: { id: token.id },
						data: { question_id: a.questionId },
					}),
				)
			}
		}
	}

	// OCR corrections.
	let correctionsApplied = 0
	for (const c of parsed.corrections) {
		const pagePts = orderedTokensByPage.get(c.page)
		if (!pagePts) continue
		const token = pagePts[c.token_index]
		if (!token) continue
		const corrected = c.corrected.trim()
		if (!corrected || corrected === token.text_raw) continue
		correctionsApplied += 1
		tokenUpdates.push(
			db.studentPaperPageToken.update({
				where: { id: token.id },
				data: { text_corrected: corrected },
			}),
		)
	}

	await Promise.all(tokenUpdates)

	// ── 7. Compute hulls + insert answer regions ──────────────────────────
	const regionRows: Array<{
		submission_id: string
		question_id: string
		question_number: string
		page_order: number
		box: ReturnType<typeof computeBboxHull>
		source: null
	}> = []

	for (const [pageOrder, assignments] of assignmentsByPage) {
		const pagePts = orderedTokensByPage.get(pageOrder) ?? []
		for (const a of assignments) {
			const bboxes = a.tokenIndices
				.map((idx) => pagePts[idx])
				.filter((t): t is PageToken => t != null)
				.map((t) => parseBbox(t.bbox, `token ${t.id} (page ${pageOrder})`))
			if (bboxes.length === 0) continue
			const hull = computeBboxHull(bboxes)
			const question_number = questionNumberById.get(a.questionId)
			if (!question_number) continue
			regionRows.push({
				submission_id: jobId,
				question_id: a.questionId,
				question_number,
				page_order: pageOrder,
				box: hull,
				source: null,
			})
		}
	}

	if (regionRows.length > 0) {
		await db.studentPaperAnswerRegion.createMany({
			data: regionRows,
			skipDuplicates: true,
		})
	}

	// ── 8. Build per-question answer_text return value ────────────────────
	// LLM-authored, punctuation-preserving. Unanswered questions → empty string.
	const answerTextById = new Map<string, string>()
	for (const span of parsed.answer_spans) {
		if (!validQuestionIds.has(span.question_id)) continue
		answerTextById.set(span.question_id, span.answer_text)
	}
	const answers: ReconstructedAnswer[] = questions.map((q) => ({
		question_id: q.question_id,
		answer_text: answerTextById.get(q.question_id) ?? "",
	}))

	logger.info(TAG, "Script-level attribution complete", {
		jobId,
		pages: imagePages.length,
		questions: questions.length,
		answers_detected: parsed.answer_spans.length,
		answers_with_text: answers.filter((a) => a.answer_text.length > 0).length,
		tokens_assigned: tokensAssigned,
		regions_created: regionRows.length,
		corrections_applied: correctionsApplied,
	})

	void logOcrRunEvent(db, jobId, {
		type: "region_attribution_complete",
		at: new Date().toISOString(),
		questions_located: regionRows.length,
	})

	return { answers }
}
