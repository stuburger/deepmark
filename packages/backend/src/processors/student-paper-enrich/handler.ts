import { db } from "@/db"
import { defaultChatModel } from "@/lib/infra/google-generative-ai"
import type { GradingResult } from "@/lib/grading/grade-questions"
import { logger } from "@/lib/infra/logger"
import { type SqsEvent, parseSqsJobId } from "@/lib/infra/sqs-job-runner"
import { type EnrichmentStatus, logStudentPaperEvent } from "@mcp-gcse/db"
import {
	type NormalisedBox,
	computeBboxHull,
	parseMarkPointsFromPrisma,
} from "@mcp-gcse/shared"
import { Output, generateText } from "ai"
import { buildAnnotationPrompt } from "./annotation-prompt"
import {
	type AnnotationPlanItem,
	AnnotationPlanSchema,
} from "./annotation-schema"
import { aoDisplayLabel } from "./ao-display"

const TAG = "student-paper-enrich"

/**
 * Resolve token indices to a span with bbox and token IDs.
 * Returns null for out-of-bounds indices (annotation will be skipped).
 */
function resolveTokenSpan(
	anchorStart: number,
	anchorEnd: number,
	tokens: Array<{ id: string; page_order: number; bbox: unknown }>,
): {
	startTokenId: string
	endTokenId: string
	bbox: NormalisedBox
	pageOrder: number
} | null {
	if (
		anchorStart < 0 ||
		anchorEnd < anchorStart ||
		anchorEnd >= tokens.length
	) {
		return null
	}
	const span = tokens.slice(anchorStart, anchorEnd + 1)
	return {
		startTokenId: span[0].id,
		endTokenId: span[span.length - 1].id,
		bbox: computeBboxHull(span.map((t) => t.bbox as NormalisedBox)),
		pageOrder: span[0].page_order,
	}
}

// ─── Shared annotation row type ──────────────────────────────────────────────

export type PendingAnnotation = {
	questionId: string
	pageOrder: number
	overlayType: string
	sentiment: string
	payload: Record<string, unknown>
	anchorTokenStartId: string | null
	anchorTokenEndId: string | null
	bbox: NormalisedBox
	parentIndex: number | undefined
	sortOrder: number
}

// ─── Non-LLM annotations (derived from grading results) ─────────────────────

type AnswerRegionRow = {
	question_id: string
	page_order: number
	box: unknown
}

/**
 * Creates a single tick or cross annotation for a point-based question.
 * Always a green tick if 1+ marks awarded. The payload includes structured
 * mark point results so the popover can render a checklist.
 * No LLM call — purely derived from grading results.
 */
function pointBasedAnnotations(
	gradingResult: GradingResult,
	answerRegion: AnswerRegionRow | undefined,
): PendingAnnotation[] {
	if (!answerRegion || gradingResult.mark_points_results.length === 0) return []

	const regionBox = answerRegion.box as NormalisedBox
	const awarded = gradingResult.awarded_score
	const max = gradingResult.max_score

	// Place the tick near the top-left of the answer region, not the center
	const tickBox: NormalisedBox = [
		regionBox[0],
		regionBox[1],
		Math.min(regionBox[0] + 30, regionBox[2]),
		Math.min(regionBox[1] + 30, regionBox[3]),
	]

	const markPoints = gradingResult.mark_points_results.map((mp) => ({
		point: mp.pointNumber,
		awarded: mp.awarded,
		criteria: mp.expectedCriteria ?? mp.studentCovered ?? `Point ${mp.pointNumber}`,
	}))

	return [
		{
			questionId: gradingResult.question_id,
			pageOrder: answerRegion.page_order,
			overlayType: "mark",
			sentiment: awarded > 0 ? "positive" : "negative",
			payload: {
				_v: 1,
				signal: awarded > 0 ? "tick" : "cross",
				reason: `${awarded}/${max}`,
				markPoints,
			},
			anchorTokenStartId: null,
			anchorTokenEndId: null,
			bbox: tickBox,
			parentIndex: undefined,
			sortOrder: 0,
		},
	]
}

/**
 * Creates a single tick/cross annotation for an MCQ question.
 * No LLM call — purely from awarded_score vs max_score.
 */
function deterministicMcqAnnotation(
	gradingResult: GradingResult,
	answerRegion: AnswerRegionRow | undefined,
): PendingAnnotation[] {
	if (!answerRegion) return []

	const correct = gradingResult.awarded_score === gradingResult.max_score
	const bbox = answerRegion.box as NormalisedBox
	const reason = correct
		? `✓ correct — ${gradingResult.awarded_score}/${gradingResult.max_score}`
		: `✗ incorrect — ${gradingResult.awarded_score}/${gradingResult.max_score}`

	return [
		{
			questionId: gradingResult.question_id,
			pageOrder: answerRegion.page_order,
			overlayType: "mark",
			sentiment: correct ? "positive" : "negative",
			payload: {
				_v: 1,
				signal: correct ? "tick" : "cross",
				reason,
			},
			anchorTokenStartId: null,
			anchorTokenEndId: null,
			bbox,
			parentIndex: undefined,
			sortOrder: 0,
		},
	]
}

// ─── Mark scheme context type ────────────────────────────────────────────────

type MarkSchemeForAnnotation = {
	description: string
	guidance: string | null
	mark_points: unknown
	marking_method: string
	marking_rules: unknown | null
}

// ─── Main handler ────────────────────────────────────────────────────────────

/**
 * Enrichment handler: generates inline annotations for a graded student paper.
 *
 * For each graded question, calls Gemini with the mark scheme, grading results,
 * and OCR tokens (with sequential indices). Gemini returns token index ranges
 * for annotation placement — no fuzzy text matching needed.
 */
export async function handler(
	event: SqsEvent,
): Promise<{ batchItemFailures?: { itemIdentifier: string }[] }> {
	const failures: { itemIdentifier: string }[] = []

	for (const record of event.Records) {
		const jobId = parseSqsJobId(record, TAG)
		if (!jobId) continue

		// Declared outside try so the catch block can mark it as failed
		let enrichmentRunId: string | null = null

		try {
			logger.info(TAG, "Enrich job received", {
				jobId,
				messageId: record.messageId,
			})

			void logStudentPaperEvent(db, jobId, {
				type: "enrich_started",
				at: new Date().toISOString(),
			})

			await db.studentPaperJob.update({
				where: { id: jobId },
				data: { enrichment_status: "processing" satisfies EnrichmentStatus },
			})

			// Phase 3: create a new EnrichmentRun for each annotation pass.
			// Old runs (and their annotations) are preserved as history.
			const enrichmentRun = await db.enrichmentRun.create({
				data: {
					grading_run_id: jobId,
					status: "processing" satisfies EnrichmentStatus,
				},
			})
			enrichmentRunId = enrichmentRun.id

			// Load job with grading results and exam paper
			const job = await db.studentPaperJob.findUniqueOrThrow({
				where: { id: jobId },
				include: {
					exam_paper: {
						select: {
							exam_board: true,
							level_descriptors: true,
							subject: true,
						},
					},
				},
			})

			const gradingResults = (job.grading_results ?? []) as GradingResult[]
			if (gradingResults.length === 0) {
				logger.warn(TAG, "No grading results — skipping enrichment", {
					jobId,
				})
				await db.studentPaperJob.update({
					where: { id: jobId },
					data: { enrichment_status: "complete" satisfies EnrichmentStatus },
				})
				await db.enrichmentRun.update({
					where: { id: enrichmentRun.id },
					data: {
						status: "complete" satisfies EnrichmentStatus,
						completed_at: new Date(),
					},
				})
				continue
			}

			// Load answer regions (for deterministic point_based and MCQ annotations)
			const answerRegions = await db.studentPaperAnswerRegion.findMany({
				where: { job_id: jobId },
				select: { question_id: true, page_order: true, box: true },
			})
			// Use the region with the lowest page_order per question (primary page)
			const regionByQuestion = new Map<string, AnswerRegionRow>()
			for (const r of answerRegions) {
				const existing = regionByQuestion.get(r.question_id)
				if (!existing || r.page_order < existing.page_order) {
					regionByQuestion.set(r.question_id, r)
				}
			}

			// Load all tokens for this job, ordered by reading position
			const allTokens = await db.studentPaperPageToken.findMany({
				where: { job_id: jobId },
				orderBy: [
					{ page_order: "asc" },
					{ para_index: "asc" },
					{ line_index: "asc" },
					{ word_index: "asc" },
				],
				select: {
					id: true,
					page_order: true,
					text_raw: true,
					text_corrected: true,
					bbox: true,
					question_id: true,
				},
			})

			// Batch-load mark schemes for all graded questions
			const markSchemeIds = [
				...new Set(
					gradingResults
						.map((r) => r.mark_scheme_id)
						.filter((id): id is string => id !== null),
				),
			]
			const markSchemes =
				markSchemeIds.length > 0
					? await db.markScheme.findMany({
							where: { id: { in: markSchemeIds } },
							select: {
								id: true,
								description: true,
								guidance: true,
								mark_points: true,
								marking_method: true,
								marking_rules: true,
							},
						})
					: []
			const markSchemeMap = new Map(markSchemes.map((ms) => [ms.id, ms]))

			const examBoard = job.exam_paper?.exam_board ?? null
			const levelDescriptors = job.exam_paper?.level_descriptors ?? null
			const model = defaultChatModel()
			const subject = job.exam_paper?.subject ?? null

			// ─── Non-LLM annotations ────────────────────────────────────────────────
			// Produce tick/cross annotations for point_based and MCQ questions
			// directly from grading results. No Gemini call needed.
			const deterministicGroups: PendingAnnotation[][] = []
			const lorGradingResults: GradingResult[] = []

			for (const result of gradingResults) {
				const method =
					result.marking_method ??
					(result.mark_scheme_id
						? (markSchemeMap.get(result.mark_scheme_id)?.marking_method ?? null)
						: null)
				const region = regionByQuestion.get(result.question_id)

				if (method === "point_based") {
					const annotations = pointBasedAnnotations(result, region)
					if (annotations.length > 0) deterministicGroups.push(annotations)
				} else if (method === "deterministic") {
					const annotations = deterministicMcqAnnotation(result, region)
					if (annotations.length > 0) deterministicGroups.push(annotations)
				} else {
					// level_of_response or unknown — use Gemini
					lorGradingResults.push(result)
				}
			}

			// ─── LLM annotations (Gemini) — LoR questions only ───────────────────────
			const questionResults = await Promise.allSettled(
				lorGradingResults.map((result) =>
					annotateOneQuestion({
						gradingResult: result,
						allTokens,
						examBoard,
						levelDescriptors,
						subject,
						markScheme: result.mark_scheme_id
							? (markSchemeMap.get(result.mark_scheme_id) ?? null)
							: null,
						model,
						jobId,
					}),
				),
			)

			const perQuestionGroups: PendingAnnotation[][] = [...deterministicGroups]
			let questionsSucceeded = deterministicGroups.length

			for (const qResult of questionResults) {
				if (qResult.status === "fulfilled" && qResult.value) {
					perQuestionGroups.push(qResult.value)
					questionsSucceeded++
				} else if (qResult.status === "rejected") {
					logger.warn(TAG, "Annotation failed for one question", {
						jobId,
						error: String(qResult.reason),
					})
				}
			}

			// Two-pass insert PER QUESTION: marks+chains first, then tags+comments.
			// parentIndex is a local index within each question's annotation array.
			let totalAnnotations = 0

			for (const questionAnnotations of perQuestionGroups) {
				const indexToDbId = new Map<number, string>()

				// Pass 1: insert marks and chains (no parent FK)
				for (let i = 0; i < questionAnnotations.length; i++) {
					const a = questionAnnotations[i]
					if (a.overlayType !== "mark" && a.overlayType !== "chain") continue

					const created = await db.studentPaperAnnotation.create({
						data: {
							job_id: jobId,
							enrichment_run_id: enrichmentRun.id,
							question_id: a.questionId,
							page_order: a.pageOrder,
							overlay_type: a.overlayType,
							sentiment: a.sentiment,
							payload: a.payload,
							anchor_token_start_id: a.anchorTokenStartId,
							anchor_token_end_id: a.anchorTokenEndId,
							bbox: a.bbox,
							sort_order: a.sortOrder,
						},
					})
					indexToDbId.set(i, created.id)
					totalAnnotations++
				}

				// Pass 2: insert tags and comments with parent FK
				for (const a of questionAnnotations) {
					if (a.overlayType !== "tag" && a.overlayType !== "comment") continue

					const parentDbId =
						a.parentIndex !== undefined
							? (indexToDbId.get(a.parentIndex) ?? null)
							: null

					await db.studentPaperAnnotation.create({
						data: {
							job_id: jobId,
							enrichment_run_id: enrichmentRun.id,
							question_id: a.questionId,
							page_order: a.pageOrder,
							overlay_type: a.overlayType,
							sentiment: a.sentiment,
							payload: a.payload,
							anchor_token_start_id: a.anchorTokenStartId,
							anchor_token_end_id: a.anchorTokenEndId,
							bbox: a.bbox,
							parent_annotation_id: parentDbId,
							sort_order: a.sortOrder,
						},
					})
					totalAnnotations++
				}
			}

			await db.studentPaperJob.update({
				where: { id: jobId },
				data: { enrichment_status: "complete" satisfies EnrichmentStatus },
			})
			await db.enrichmentRun.update({
				where: { id: enrichmentRun.id },
				data: {
					status: "complete" satisfies EnrichmentStatus,
					completed_at: new Date(),
				},
			})

			void logStudentPaperEvent(db, jobId, {
				type: "enrich_complete",
				at: new Date().toISOString(),
				annotations_count: totalAnnotations,
				questions_annotated: questionsSucceeded,
			})

			logger.info(TAG, "Enrich job complete", {
				jobId,
				annotations: totalAnnotations,
				questions: questionsSucceeded,
			})
		} catch (err) {
			logger.error(TAG, "Enrich job failed", {
				jobId,
				error: String(err),
			})
			// Only update enrichment_status — never touch the main job status.
			// A graded job (status: "ocr_complete") must not be downgraded to
			// "failed" because an annotation overlay errored. The DLQ handler
			// will detect the enrichment failure via status + enrichment_status.
			await db.studentPaperJob
				.update({
					where: { id: jobId },
					data: { enrichment_status: "failed" satisfies EnrichmentStatus },
				})
				.catch(() => {})
			if (enrichmentRunId) {
				db.enrichmentRun
					.update({
						where: { id: enrichmentRunId },
						data: {
							status: "failed" satisfies EnrichmentStatus,
							error: String(err),
						},
					})
					.catch(() => {})
			}
			failures.push({ itemIdentifier: record.messageId })
		}
	}

	return failures.length > 0 ? { batchItemFailures: failures } : {}
}

// ─── Per-question annotation ────────────────────────────────────────────────

type AnnotateOneQuestionArgs = {
	gradingResult: GradingResult
	allTokens: Array<{
		id: string
		page_order: number
		text_raw: string
		text_corrected: string | null
		bbox: unknown
		question_id: string | null
	}>
	examBoard: string | null
	levelDescriptors: string | null
	subject: string | null
	markScheme: MarkSchemeForAnnotation | null
	model: ReturnType<typeof defaultChatModel>
	jobId: string
}

async function annotateOneQuestion(args: AnnotateOneQuestionArgs) {
	const {
		gradingResult,
		allTokens,
		examBoard,
		levelDescriptors,
		subject,
		markScheme,
		model,
		jobId,
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

	// Parse mark scheme mark points for the prompt
	const markSchemeContext = markScheme
		? {
				description: markScheme.description,
				guidance: markScheme.guidance,
				markPoints: parseMarkPointsFromPrisma(markScheme.mark_points).map(
					(mp) => ({
						pointNumber: mp.pointNumber,
						description: mp.description,
						criteria: mp.criteria,
					}),
				),
				markingMethod: markScheme.marking_method,
				markingRules: markScheme.marking_rules,
			}
		: null

	// Build the prompt
	const prompt = buildAnnotationPrompt({
		gradingResult,
		questionText: gradingResult.question_text,
		maxScore: gradingResult.max_score,
		tokens: tokenSummaries,
		examBoard,
		subject,
		markScheme: markSchemeContext,
		levelDescriptors,
	})

	// Call Gemini
	const { output } = await generateText({
		model,
		messages: [
			{
				role: "system",
				content:
					"You are an expert GCSE examiner producing structured annotations for a student's exam script. Output valid JSON matching the schema. Be precise and concise.",
			},
			{ role: "user", content: prompt },
		],
		output: Output.object({
			schema: AnnotationPlanSchema,
		}),
	})

	const plan = output

	// Resolve token indices to spans and build pending records
	const pending: PendingAnnotation[] = []

	for (let i = 0; i < plan.annotations.length; i++) {
		const item = plan.annotations[i]

		// Resolve token indices to span
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

		const payload = buildPayload(item, examBoard)

		pending.push({
			questionId: gradingResult.question_id,
			pageOrder: span.pageOrder,
			overlayType: item.overlay_type,
			sentiment: item.sentiment,
			payload,
			anchorTokenStartId: span.startTokenId,
			anchorTokenEndId: span.endTokenId,
			bbox: span.bbox,
			parentIndex: item.parent_index,
			sortOrder: i,
		})
	}

	return pending
}

// ─── Payload builder ─────────────────────────────────────────────────────────

function buildPayload(
	item: AnnotationPlanItem,
	examBoard: string | null,
): Record<string, unknown> {
	switch (item.overlay_type) {
		case "mark":
			return {
				_v: 1,
				signal: item.signal ?? "tick",
				...(item.label ? { label: item.label } : {}),
				...(item.reason ? { reason: item.reason } : {}),
			}
		case "tag":
			return {
				_v: 1,
				category: item.category ?? "AO1",
				display: aoDisplayLabel(examBoard, item.category ?? "AO1"),
				awarded: item.awarded ?? true,
				quality: item.quality ?? "valid",
				...(item.reason ? { reason: item.reason } : {}),
			}
		case "comment":
			return {
				_v: 1,
				text: item.comment_text ?? "",
			}
		case "chain":
			return {
				_v: 1,
				chainType: item.chain_type ?? "reasoning",
				phrase: item.trigger_phrase ?? "",
			}
		default:
			return { _v: 1 }
	}
}
