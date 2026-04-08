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

const TAG = "mark-scheme-pdf"

// ─── Types ───────────────────────────────────────────────────────────────────

type MarkPointRow = {
	point_number: number
	description: string
	points: number
	criteria: string
}

type MarkingRulesValue =
	| {
			command_word: string | undefined
			items_required: number | undefined
			levels: Array<{
				level: number
				mark_range: [number, number]
				descriptor: string
				ao_requirements?: string[]
			}>
			caps?: Array<{
				condition: string
				max_level?: number
				max_mark?: number
				reason: string
			}>
	  }
	| undefined

/** Shape of one question entry from Gemini's mark scheme extraction response. */
export type ExtractedQuestion = {
	question_text: string
	question_type: string
	total_marks: number
	ao_allocations?: Array<{ ao_code: string; marks: number }>
	mark_points: Array<{
		description: string
		criteria: string
		points: number
	}>
	acceptable_answers?: string[]
	guidance?: string
	question_number?: string
	correct_option?: string
	options?: Array<{ option_label: string; option_text: string }>
	marking_method?: string
	command_word?: string
	items_required?: number
	levels?: Array<{
		level: number
		mark_range: [number, number]
		descriptor: string
		ao_requirements?: string[]
	}>
	caps?: Array<{
		condition: string
		max_level?: number
		max_mark?: number
		reason: string
	}>
	matched_question_id?: string | null
}

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

// ─── Main ────────────────────────────────────────────────────────────────────

export async function processExtractedQuestion(
	q: ExtractedQuestion,
	index: number,
	total: number,
	ctx: ProcessQuestionContext,
): Promise<void> {
	const questionText = q.question_text
	const canonicalNumber = q.question_number
		? normalizeQuestionNumber(q.question_number)
		: null

	// Validate Gemini's matched_question_id against our prefetched list to
	// guard against hallucinated IDs.
	const geminiMatchedId =
		q.matched_question_id &&
		ctx.existingQuestions.some((eq) => eq.id === q.matched_question_id)
			? q.matched_question_id
			: null

	logger.info(TAG, "Processing question", {
		jobId: ctx.jobId,
		index: index + 1,
		total,
		question_number: canonicalNumber,
		marking_method: q.marking_method ?? "point_based",
		gemini_matched: geminiMatchedId != null,
	})

	// Skip the embedding API call when Gemini already provided a confident
	// match — it would be wasted work and "Question N" placeholder text
	// produces a meaningless vector anyway.
	let embeddingVec: number[] = []
	let existingId: string | null = geminiMatchedId
	if (!existingId) {
		embeddingVec = await embedQuestionText(questionText)
		existingId = await findMatchingQuestionId(
			ctx.examPaperId,
			ctx.examBoard ?? "",
			canonicalNumber,
			embeddingVec,
		)
	}

	const matchMethod = geminiMatchedId
		? "gemini_context"
		: existingId && canonicalNumber
			? "question_number"
			: existingId
				? "embedding"
				: "none"
	logger.info(
		TAG,
		existingId
			? `Matched existing question via ${matchMethod}`
			: "No match — creating new question",
		{ jobId: ctx.jobId, question_index: index + 1, existing_id: existingId },
	)

	const vecStr =
		embeddingVec.length > 0 ? embeddingToVectorStr(embeddingVec) : null
	const markPointsPrisma = (q.mark_points ?? []).map((mp, idx) => ({
		point_number: idx + 1,
		description: mp.description,
		points: mp.points ?? 1,
		criteria: mp.criteria,
	}))
	const pointsTotal =
		q.total_marks ?? markPointsPrisma.reduce((s, mp) => s + mp.points, 0)

	// When Gemini matched this entry to an existing question, use the existing
	// question's authoritative question_type rather than Gemini's extraction.
	const matchedExistingQuestion = geminiMatchedId
		? ctx.existingQuestions.find((eq) => eq.id === geminiMatchedId)
		: null
	const resolvedQuestionType =
		matchedExistingQuestion?.question_type ?? q.question_type

	const correctOptionLabels =
		resolvedQuestionType === "multiple_choice" && q.correct_option
			? [q.correct_option.trim()]
			: []
	const effectiveMarkingMethod: MarkingMethod =
		resolvedQuestionType === "multiple_choice"
			? "deterministic"
			: q.marking_method === "level_of_response"
				? "level_of_response"
				: "point_based"
	const markingRules =
		effectiveMarkingMethod === "level_of_response" &&
		q.levels &&
		q.levels.length > 0
			? {
					command_word: q.command_word,
					items_required: q.items_required,
					levels: q.levels,
					caps: q.caps?.length ? q.caps : undefined,
				}
			: undefined

	const aoDescription = formatAoAllocations(q.ao_allocations) ?? ""

	if (existingId) {
		await upsertExistingQuestion({
			existingId,
			q,
			geminiMatchedId,
			resolvedQuestionType,
			canonicalNumber,
			vecStr,
			markPointsPrisma,
			pointsTotal,
			correctOptionLabels,
			effectiveMarkingMethod,
			markingRules,
			aoDescription,
			questionText,
			ctx,
		})
	} else {
		await createNewQuestion({
			q,
			questionText,
			canonicalNumber,
			vecStr,
			markPointsPrisma,
			pointsTotal,
			correctOptionLabels,
			effectiveMarkingMethod,
			markingRules,
			aoDescription,
			ctx,
		})
	}
}

// ─── Upsert existing question ────────────────────────────────────────────────

async function upsertExistingQuestion(args: {
	existingId: string
	q: ExtractedQuestion
	geminiMatchedId: string | null
	resolvedQuestionType: string
	canonicalNumber: string | null
	vecStr: string | null
	markPointsPrisma: MarkPointRow[]
	pointsTotal: number
	correctOptionLabels: string[]
	effectiveMarkingMethod: MarkingMethod
	markingRules: MarkingRulesValue
	aoDescription: string
	questionText: string
	ctx: ProcessQuestionContext
}): Promise<void> {
	const {
		existingId,
		q,
		geminiMatchedId,
		resolvedQuestionType,
		canonicalNumber,
		vecStr,
		markPointsPrisma,
		pointsTotal,
		correctOptionLabels,
		effectiveMarkingMethod,
		markingRules,
		aoDescription,
		questionText,
		ctx,
	} = args

	await db.question.update({
		where: { id: existingId },
		data: {
			topic: ctx.subject,
			points: pointsTotal,
			...(geminiMatchedId
				? {}
				: {
						question_type:
							q.question_type === "multiple_choice"
								? "multiple_choice"
								: "written",
					}),
			...(resolvedQuestionType === "multiple_choice" && q.options?.length
				? { multiple_choice_options: q.options }
				: {}),
			...(canonicalNumber ? { question_number: canonicalNumber } : {}),
		},
	})

	if (vecStr) {
		await db.$executeRaw`
			UPDATE questions SET embedding = (${vecStr}::text)::vector WHERE id = ${existingId}
		`
	}

	const existingMarkScheme = await db.markScheme.findFirst({
		where: { question_id: existingId },
	})

	const markSchemeData = {
		description:
			aoDescription || q.question_text.slice(0, 500),
		guidance: q.guidance ?? null,
		points_total: pointsTotal,
		mark_points: markPointsPrisma,
		correct_option_labels: correctOptionLabels,
		marking_method: effectiveMarkingMethod,
		marking_rules: markingRules ?? undefined,
		link_status: "auto_linked" as const,
	}

	let markSchemeId: string
	if (existingMarkScheme) {
		await db.markScheme.update({
			where: { id: existingMarkScheme.id },
			data: markSchemeData,
		})
		markSchemeId = existingMarkScheme.id
	} else {
		const newMarkScheme = await db.markScheme.create({
			data: {
				question_id: existingId,
				created_by_id: ctx.uploadedBy,
				tags: [],
				...markSchemeData,
			},
		})
		markSchemeId = newMarkScheme.id
	}

	if (ctx.runAdversarialLoopEnabled && ctx.grader) {
		await runAndPersistAdversarialTests({
			markSchemeId,
			questionId: existingId,
			questionText,
			topic: ctx.subject,
			questionType: q.question_type,
			pointsTotal,
			markPointsPrisma,
			effectiveMarkingMethod,
			markingRules,
			correctOptionLabels,
			aoDescription,
			guidance: q.guidance,
			grader: ctx.grader,
		})
	}
}

// ─── Create new question ─────────────────────────────────────────────────────

async function createNewQuestion(args: {
	q: ExtractedQuestion
	questionText: string
	canonicalNumber: string | null
	vecStr: string | null
	markPointsPrisma: MarkPointRow[]
	pointsTotal: number
	correctOptionLabels: string[]
	effectiveMarkingMethod: MarkingMethod
	markingRules: MarkingRulesValue
	aoDescription: string
	ctx: ProcessQuestionContext
}): Promise<void> {
	const {
		q,
		questionText,
		canonicalNumber,
		vecStr,
		markPointsPrisma,
		pointsTotal,
		correctOptionLabels,
		effectiveMarkingMethod,
		markingRules,
		aoDescription,
		ctx,
	} = args

	const newQuestion = await db.question.create({
		data: {
			text: questionText,
			topic: ctx.subject,
			created_by_id: ctx.uploadedBy,
			subject: ctx.subject,
			points: pointsTotal,
			question_type:
				q.question_type === "multiple_choice" ? "multiple_choice" : "written",
			multiple_choice_options:
				q.question_type === "multiple_choice" && q.options?.length
					? q.options
					: [],
			source_pdf_ingestion_job_id: ctx.jobId,
			origin: "mark_scheme",
			question_number: canonicalNumber,
		},
	})

	if (vecStr) {
		await db.$executeRaw`
			UPDATE questions SET embedding = (${vecStr}::text)::vector WHERE id = ${newQuestion.id}
		`
	}

	const newMarkScheme = await db.markScheme.create({
		data: {
			question_id: newQuestion.id,
			description: aoDescription || "",
			guidance: q.guidance ?? null,
			created_by_id: ctx.uploadedBy,
			tags: [],
			points_total: pointsTotal,
			mark_points: markPointsPrisma,
			correct_option_labels: correctOptionLabels,
			marking_method: effectiveMarkingMethod,
			marking_rules: markingRules ?? undefined,
			link_status: "linked",
		},
	})

	if (ctx.runAdversarialLoopEnabled && ctx.grader) {
		await runAndPersistAdversarialTests({
			markSchemeId: newMarkScheme.id,
			questionId: newQuestion.id,
			questionText,
			topic: ctx.subject,
			questionType: q.question_type,
			pointsTotal,
			markPointsPrisma,
			effectiveMarkingMethod,
			markingRules,
			correctOptionLabels,
			aoDescription,
			guidance: q.guidance,
			grader: ctx.grader,
		})
	}
}
