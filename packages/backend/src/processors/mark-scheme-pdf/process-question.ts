import { db } from "@/db"
import { normalizeQuestionNumber } from "@/lib/grading/normalize-question-number"
import { embedQuestionText } from "@/lib/infra/google-generative-ai"
import { logger } from "@/lib/infra/logger"
import type { MarkingMethod, Subject } from "@mcp-gcse/db"
import type { Grader } from "@mcp-gcse/shared"
import { runAndPersistAdversarialTests } from "./adversarial-testing"
import { formatAoAllocations } from "./formatting"
import type { ExistingQuestionContext } from "./prompts"
import { embeddingToVectorStr, findMatchingQuestionId } from "./queries"
import type { ExtractedQuestion } from "./schema"

export type { ExtractedQuestion }

const TAG = "mark-scheme-pdf"

export type ProcessQuestionContext = {
	jobId: string
	uploadedBy: string
	subject: Subject
	examPaperId: string | null
	examBoard: string | null
	existingQuestions: ExistingQuestionContext[]
	grader: Grader | null
	runAdversarialLoopEnabled: boolean
}

// ─── Internal types ──────────────────────────────────────────────────────────

type QuestionMatch = {
	existingId: string | null
	geminiMatchedId: string | null
	matchMethod: "gemini_context" | "question_number" | "embedding" | "none"
	embeddingVecStr: string | null
}

type MarkPointRow = {
	point_number: number
	description: string
	points: number
	criteria: string
}

/** All derived fields needed to persist a question + mark scheme. */
type ResolvedMarkScheme = {
	raw: ExtractedQuestion
	questionText: string
	canonicalNumber: string | null
	match: QuestionMatch
	resolvedQuestionType: string
	markPoints: MarkPointRow[]
	pointsTotal: number
	correctOptionLabels: string[]
	markingMethod: MarkingMethod
	aoDescription: string
	content: string
}

// ─── Stage 1: Match ─────────────────────────────────────────────────────────
// Async — calls embedding API and DB to find existing question

async function matchExistingQuestion(
	q: ExtractedQuestion,
	ctx: ProcessQuestionContext,
): Promise<QuestionMatch> {
	// Validate Gemini's matched_question_id against our prefetched list
	// to guard against hallucinated IDs.
	const geminiMatchedId =
		q.matched_question_id &&
		ctx.existingQuestions.some((eq) => eq.id === q.matched_question_id)
			? q.matched_question_id
			: null

	if (geminiMatchedId) {
		return {
			existingId: geminiMatchedId,
			geminiMatchedId,
			matchMethod: "gemini_context",
			embeddingVecStr: null,
		}
	}

	// No Gemini match — compute embedding and search by number or similarity
	const embeddingVec = await embedQuestionText(q.question_text)
	const existingId = await findMatchingQuestionId(
		ctx.examPaperId,
		ctx.examBoard ?? "",
		q.question_number ? normalizeQuestionNumber(q.question_number) : null,
		embeddingVec,
	)

	const matchMethod = existingId
		? q.question_number
			? "question_number"
			: "embedding"
		: "none"

	return {
		existingId,
		geminiMatchedId: null,
		matchMethod,
		embeddingVecStr:
			embeddingVec.length > 0 ? embeddingToVectorStr(embeddingVec) : null,
	}
}

// ─── Stage 2: Derive ────────────────────────────────────────────────────────
// Pure — no side effects, fully testable

export function resolveMarkSchemeFields(
	q: ExtractedQuestion,
	match: QuestionMatch,
	existingQuestions: ExistingQuestionContext[],
): ResolvedMarkScheme {
	const questionText = q.question_text
	const canonicalNumber = q.question_number
		? normalizeQuestionNumber(q.question_number)
		: null

	// When Gemini matched to an existing question, trust its authoritative
	// question_type — the extraction can be contaminated by the context block.
	const matchedExisting = match.geminiMatchedId
		? existingQuestions.find((eq) => eq.id === match.geminiMatchedId)
		: null
	const resolvedQuestionType = matchedExisting?.question_type ?? q.question_type

	const correctOptionLabels =
		resolvedQuestionType === "multiple_choice" && q.correct_option
			? [q.correct_option.trim()]
			: []

	const markingMethod: MarkingMethod =
		resolvedQuestionType === "multiple_choice"
			? "deterministic"
			: q.marking_method === "level_of_response"
				? "level_of_response"
				: "point_based"

	const markPoints = (q.mark_points ?? []).map((mp, idx) => ({
		point_number: idx + 1,
		description: mp.description,
		points: mp.points ?? 1,
		criteria: mp.criteria,
	}))

	const pointsTotal =
		q.total_marks ?? markPoints.reduce((s, mp) => s + mp.points, 0)

	return {
		raw: q,
		questionText,
		canonicalNumber,
		match,
		resolvedQuestionType,
		markPoints,
		pointsTotal,
		correctOptionLabels,
		markingMethod,
		aoDescription: formatAoAllocations(q.ao_allocations ?? undefined) ?? "",
		content: q.content ?? "",
	}
}

// ─── Stage 3: Persist ───────────────────────────────────────────────────────
// Async — DB writes for question + mark scheme + optional adversarial tests

async function persistQuestionAndMarkScheme(
	resolved: ResolvedMarkScheme,
	ctx: ProcessQuestionContext,
): Promise<void> {
	if (resolved.match.existingId) {
		await updateExistingQuestion(resolved, ctx)
	} else {
		await createNewQuestion(resolved, ctx)
	}
}

async function updateExistingQuestion(
	r: ResolvedMarkScheme,
	ctx: ProcessQuestionContext,
): Promise<void> {
	// biome-ignore lint/style/noNonNullAssertion: existingId guaranteed present for update path
	const questionId = r.match.existingId!

	await db.question.update({
		where: { id: questionId },
		data: {
			topic: ctx.subject,
			points: r.pointsTotal,
			// Only overwrite question_type when NOT Gemini-matched — the context
			// block can contaminate Gemini's extraction for matched entries.
			...(r.match.geminiMatchedId
				? {}
				: {
						question_type:
							r.raw.question_type === "multiple_choice"
								? "multiple_choice"
								: "written",
					}),
			...(r.resolvedQuestionType === "multiple_choice" && r.raw.options?.length
				? { multiple_choice_options: r.raw.options }
				: {}),
			...(r.canonicalNumber ? { question_number: r.canonicalNumber } : {}),
		},
	})

	if (r.match.embeddingVecStr) {
		await writeEmbedding(questionId, r.match.embeddingVecStr)
	}

	const markSchemeId = await upsertMarkScheme(questionId, r, ctx, "auto_linked")

	await maybeRunAdversarialTests(markSchemeId, questionId, r, ctx)
}

async function createNewQuestion(
	r: ResolvedMarkScheme,
	ctx: ProcessQuestionContext,
): Promise<void> {
	const newQuestion = await db.question.create({
		data: {
			text: r.questionText,
			topic: ctx.subject,
			created_by_id: ctx.uploadedBy,
			subject: ctx.subject,
			points: r.pointsTotal,
			question_type:
				r.raw.question_type === "multiple_choice"
					? "multiple_choice"
					: "written",
			multiple_choice_options:
				r.raw.question_type === "multiple_choice" && r.raw.options?.length
					? r.raw.options
					: [],
			source_pdf_ingestion_job_id: ctx.jobId,
			origin: "mark_scheme",
			question_number: r.canonicalNumber,
		},
	})

	if (r.match.embeddingVecStr) {
		await writeEmbedding(newQuestion.id, r.match.embeddingVecStr)
	}

	const markSchemeId = await upsertMarkScheme(newQuestion.id, r, ctx, "linked")

	await maybeRunAdversarialTests(markSchemeId, newQuestion.id, r, ctx)
}

// ─── Shared helpers ──────────────────────────────────────────────────────────

async function writeEmbedding(
	questionId: string,
	vecStr: string,
): Promise<void> {
	await db.$executeRaw`
		UPDATE questions SET embedding = (${vecStr}::text)::vector WHERE id = ${questionId}
	`
}

async function upsertMarkScheme(
	questionId: string,
	r: ResolvedMarkScheme,
	ctx: ProcessQuestionContext,
	linkStatus: "linked" | "auto_linked",
): Promise<string> {
	const markSchemeFields = {
		description: r.aoDescription || r.questionText.slice(0, 500),
		guidance: r.raw.guidance ?? null,
		points_total: r.pointsTotal,
		mark_points: r.markPoints,
		correct_option_labels: r.correctOptionLabels,
		marking_method: r.markingMethod,
		content: r.content,
		link_status: linkStatus,
	}

	const existing = await db.markScheme.findFirst({
		where: { question_id: questionId },
	})

	if (existing) {
		await db.markScheme.update({
			where: { id: existing.id },
			data: markSchemeFields,
		})
		return existing.id
	}

	const created = await db.markScheme.create({
		data: {
			question_id: questionId,
			created_by_id: ctx.uploadedBy,
			tags: [],
			...markSchemeFields,
		},
	})
	return created.id
}

async function maybeRunAdversarialTests(
	markSchemeId: string,
	questionId: string,
	r: ResolvedMarkScheme,
	ctx: ProcessQuestionContext,
): Promise<void> {
	if (!ctx.runAdversarialLoopEnabled || !ctx.grader) return

	await runAndPersistAdversarialTests({
		markSchemeId,
		questionId,
		questionText: r.questionText,
		topic: ctx.subject,
		questionType: r.raw.question_type,
		pointsTotal: r.pointsTotal,
		markPointsPrisma: r.markPoints,
		effectiveMarkingMethod: r.markingMethod,
		content: r.content,
		correctOptionLabels: r.correctOptionLabels,
		aoDescription: r.aoDescription,
		guidance: r.raw.guidance,
		grader: ctx.grader,
	})
}

// ─── Public entry point ──────────────────────────────────────────────────────

export async function processExtractedQuestion(
	q: ExtractedQuestion,
	index: number,
	total: number,
	ctx: ProcessQuestionContext,
): Promise<void> {
	logger.info(TAG, "Processing question", {
		jobId: ctx.jobId,
		index: index + 1,
		total,
		question_number: q.question_number,
		marking_method: q.marking_method ?? "point_based",
	})

	const match = await matchExistingQuestion(q, ctx)

	logger.info(
		TAG,
		match.existingId
			? `Matched existing question via ${match.matchMethod}`
			: "No match — creating new question",
		{
			jobId: ctx.jobId,
			question_index: index + 1,
			existing_id: match.existingId,
		},
	)

	const resolved = resolveMarkSchemeFields(q, match, ctx.existingQuestions)

	await persistQuestionAndMarkScheme(resolved, ctx)
}
