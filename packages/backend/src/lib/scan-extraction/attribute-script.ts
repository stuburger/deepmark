import { db } from "@/db"
import { callLlmWithFallback } from "@/lib/infra/llm-runtime"
import { logger } from "@/lib/infra/logger"
import { outputSchema } from "@/lib/infra/output-schema"
import { getFileBase64 } from "@/lib/infra/s3"
import { logOcrRunEvent } from "@mcp-gcse/db"
import {
	type LlmRunner,
	type LlmTimeoutMs,
	clampLlmTimeoutMs,
	computeBboxHull,
	sortTokensSpatially,
} from "@mcp-gcse/shared"
import { generateText } from "ai"
import {
	type McqSchemaQuestion,
	type PagePromptBlock,
	type ScriptAttributionOutput,
	buildScriptAttributionPrompt,
	buildScriptAttributionSchema,
} from "./attribute-script-prompt"
import type { ReconstructedAnswer } from "./reconstruct-answers"

const TAG = "attribute-script"

const MAX_ATTEMPTS = 2

export type AttributeScriptQuestion = {
	question_id: string
	question_number: string
	question_text: string
	is_mcq: boolean
	/** Required when `is_mcq` is true; ignored otherwise. The schema's MCQ
	 *  branch enum is built from these labels, so the model literally cannot
	 *  return a letter that isn't one of them. */
	mcq_option_labels?: string[]
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
	/** Per-attempt wall-clock budget forwarded to the runner. */
	timeoutMs?: LlmTimeoutMs
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
 * Filters out span entries referencing pages that have no tokens (model
 * hallucinated a page index outside the valid set) and validates what
 * remains. Bad pages are soft-dropped — they're returned in `droppedPages`
 * for logging, not as retry-able errors, because re-running the LLM rarely
 * recovers and burns vision calls. Phase 2's deterministic fill already
 * tolerates missing pages, so the rest of the span is safe to use.
 *
 * Errors returned by this function are the genuinely retry-able classes:
 * non-integer indices, empty/reversed ranges, and cross-question overlap.
 */
function filterAndValidateAnswerSpans(
	output: ScriptAttributionOutput,
	tokensByPage: Map<number, PageToken[]>,
	validQuestionIds: Set<string>,
): {
	filtered: ScriptAttributionOutput
	errors: string[]
	droppedPages: string[]
} {
	const errors: string[] = []
	const droppedPages: string[] = []
	type Range = { qid: string; start: number; end: number }
	const rangesByPage = new Map<number, Range[]>()
	const filteredSpans: ScriptAttributionOutput["answer_spans"] = []

	for (const span of output.answer_spans ?? []) {
		if (!validQuestionIds.has(span.question_id)) continue
		const keptPages: typeof span.pages = []
		for (const page of span.pages ?? []) {
			const pagePts = tokensByPage.get(page.page)
			if (!pagePts) {
				droppedPages.push(`Q(${span.question_id}) page ${page.page}`)
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
			keptPages.push(page)
			const list = rangesByPage.get(page.page) ?? []
			list.push({
				qid: span.question_id,
				start: page.token_start,
				end: page.token_end,
			})
			rangesByPage.set(page.page, list)
		}
		if (keptPages.length > 0) {
			filteredSpans.push({ ...span, pages: keptPages })
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

	return {
		filtered: { ...output, answer_spans: filteredSpans },
		errors,
		droppedPages,
	}
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
	timeoutMs,
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
		.map((q) => {
			const mcqHint = q.is_mcq
				? ` [multiple-choice — options: ${(q.mcq_option_labels ?? []).join(", ")}]`
				: ""
			return `Q${q.question_number} (id: ${q.question_id})${mcqHint}: ${q.question_text}`
		})
		.join("\n")

	// Build the output schema per-call from the MCQ questions on this script.
	// Each MCQ branch literal-matches its question_id and enum-matches against
	// its actual option labels — invalid letters can't parse and trigger a
	// retry with explicit feedback.
	const mcqSchemaQuestions: McqSchemaQuestion[] = questions
		.filter((q) => q.is_mcq && (q.mcq_option_labels?.length ?? 0) > 0)
		.map((q) => ({
			question_id: q.question_id,
			// biome-ignore lint/style/noNonNullAssertion: filtered above
			option_labels: q.mcq_option_labels!,
		}))
	const attributionSchema = buildScriptAttributionSchema(mcqSchemaQuestions)

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
				async (model, entry, report, signal) => {
					const result = await generateText({
						model,
						abortSignal: signal,
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
						output: outputSchema(attributionSchema),
					})
					report.usage = result.usage
					return result
				},
				// Multi-page attribution (28 pages observed) takes 30–180 s on
				// healthy runs. 240 s is the stuck-call canary — fail fast on
				// model loops. When a Lambda envelope is passed in, clamp to
				// the tighter of the two so we still bail before the Lambda
				// kill (otherwise the Gemini fetch is orphaned and billed).
				{ llm, timeoutMs: clampLlmTimeoutMs(240_000, timeoutMs) },
			)
			output = rawOutput as ScriptAttributionOutput
		} catch (err) {
			// LLM-side or schema-parse failure. The schema for `mcq_answers`
			// is per-question strict — an invalid letter or unknown
			// question_id makes the parse fail. Treat that as retryable
			// feedback (the next attempt sees the error in the prompt header)
			// rather than a hard failure, but only up to MAX_ATTEMPTS.
			if (attempt < MAX_ATTEMPTS) {
				logger.warn(TAG, "Attribution call failed — retrying with feedback", {
					jobId,
					attempt,
					error: String(err),
				})
				retryFeedback = `Your previous response failed schema validation: ${String(err)}`
				continue
			}
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

		const { filtered, errors, droppedPages } = filterAndValidateAnswerSpans(
			output,
			orderedTokensByPage,
			validQuestionIds,
		)

		if (droppedPages.length > 0) {
			logger.warn(
				TAG,
				"Attribution returned spans on unknown pages — dropped",
				{
					jobId,
					attempt,
					droppedPages,
					validPages: [...orderedTokensByPage.keys()].sort((a, b) => a - b),
				},
			)
		}

		if (errors.length === 0) {
			parsed = filtered
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

	// ── 6. Persist per-token state ────────────────────────────────────────
	// The LLM authored `answer_text` per question (marker-facing, with
	// corrections, paragraphs, punctuation). We trust that text and persist
	// only:
	//   • `question_id` per attributed token (so consumers can group)
	//   • `text_corrected` from the sparse `corrections` list (so the scan
	//     overlay can render the corrected word at the token's bbox)
	// Token → char-position mapping is NOT precomputed here — consumers do a
	// runtime fuzzy align via `alignTokensToAnswer` (Levenshtein) when they
	// need it. Annotation positioning is therefore approximate; the marker
	// text the grader reads is polished. See CLAUDE.md.
	const tokenUpdates: Promise<unknown>[] = []
	let tokensAssigned = 0
	let correctionsApplied = 0

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
	// LLM-authored, punctuation-preserving for written questions; the option
	// letter for MCQs (sourced from `mcq_answers`, which is per-question
	// enum-constrained — invalid letters can't reach this point). Unanswered
	// questions → empty string.
	const answerTextById = new Map<string, string>()
	for (const span of parsed.answer_spans) {
		if (!validQuestionIds.has(span.question_id)) continue
		answerTextById.set(span.question_id, span.answer_text)
	}
	const mcqQuestionIds = new Set(
		questions.filter((q) => q.is_mcq).map((q) => q.question_id),
	)
	let mcqAnswered = 0
	for (const mcq of parsed.mcq_answers) {
		if (!mcqQuestionIds.has(mcq.question_id)) continue
		answerTextById.set(mcq.question_id, mcq.selected_label)
		mcqAnswered += 1
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
		mcq_answered: mcqAnswered,
		tokens_assigned: tokensAssigned,
		corrections_applied: correctionsApplied,
		regions_created: regionRows.length,
	})

	void logOcrRunEvent(db, jobId, {
		type: "region_attribution_complete",
		at: new Date().toISOString(),
		questions_located: regionRows.length,
	})

	return { answers }
}
