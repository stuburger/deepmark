"use server"

import { resourceAction, resourcesAction } from "@/lib/authz"
import { db } from "@/lib/db"
import type { JobEvent, Prisma } from "@mcp-gcse/db"
import {
	type GradeBoundary,
	gradeBoundariesSchema,
	parseAnnotationPayload,
	sortTokensSpatially,
} from "@mcp-gcse/shared"
import { z } from "zod"
import { sumPaperPoints } from "../paper-totals"
import { ANNOTATION_BOOKKEEPING_SELECT } from "../selects"
import { deriveAnnotationStatus, deriveScanStatus } from "../status"
import type {
	AnswerRegion,
	AnyAnnotationPayload,
	ExtractedAnswer,
	GradingResult,
	OverlayType,
	PageToken,
	StudentPaperAnnotation,
	StudentPaperResultPayload,
	SubmissionFeedback,
	TeacherOverride,
} from "../types"
import { toSubmissionFeedback } from "./feedback-mapper"

function parseStoredBoundaries(raw: unknown): GradeBoundary[] | null {
	if (raw === null || raw === undefined) return null
	const result = gradeBoundariesSchema.safeParse(raw)
	return result.success ? result.data : null
}

type RegionRow = {
	question_id: string
	page_order: number
	box: unknown
	source: string | null
}

function mergeRegionsIntoResults(
	rawResults: GradingResult[],
	regionRows: RegionRow[],
): GradingResult[] {
	const byQuestion = new Map<string, AnswerRegion[]>()
	for (const row of regionRows) {
		const existing = byQuestion.get(row.question_id) ?? []
		existing.push({
			page: row.page_order,
			box: row.box as [number, number, number, number],
			source: row.source,
		})
		byQuestion.set(row.question_id, existing)
	}
	return rawResults.map((r) => ({
		...r,
		answer_regions: byQuestion.get(r.question_id) ?? [],
	}))
}

const submissionDetailInclude = {
	exam_paper: {
		select: {
			id: true,
			title: true,
			level_descriptors: true,
			tier: true,
			grade_boundaries: true,
			grade_boundary_mode: true,
			sections: {
				orderBy: { order: "asc" as const },
				select: {
					order: true,
					exam_section_questions: {
						orderBy: { order: "asc" as const },
						select: {
							order: true,
							question: {
								select: {
									id: true,
									text: true,
									question_number: true,
									question_type: true,
									points: true,
									multiple_choice_options: true,
									mark_schemes: {
										select: { correct_option_labels: true },
										take: 1,
									},
									question_stimuli: {
										orderBy: { order: "asc" as const },
										select: {
											stimulus: {
												select: {
													label: true,
													content: true,
													content_type: true,
												},
											},
										},
									},
								},
							},
						},
					},
				},
			},
		},
	},
	answer_regions: {
		select: {
			question_id: true,
			page_order: true,
			box: true,
			source: true,
		},
	},
	ocr_runs: {
		orderBy: { created_at: "desc" as const },
		take: 1,
		select: {
			id: true,
			status: true,
			error: true,
			extracted_answers_raw: true,
			page_analyses: true,
			job_events: true,
			llm_snapshot: true,
		},
	},
	grading_runs: {
		orderBy: { created_at: "desc" as const },
		take: 1,
		select: {
			id: true,
			status: true,
			error: true,
			grading_results: true,
			examiner_summary: true,
			job_events: true,
			llm_snapshot: true,
			annotation_llm_snapshot: true,
			...ANNOTATION_BOOKKEEPING_SELECT,
		},
	},
	teacher_overrides: {
		select: { question_id: true, score_override: true },
	},
} as const

type SubmissionWithDetail = Prisma.StudentSubmissionGetPayload<{
	include: typeof submissionDetailInclude
}>

type PageEntry = { key: string; order: number; mime_type: string }
type RawExtracted = {
	student_name?: string | null
	answers?: ExtractedAnswer[]
}

function toJobPayload(sub: SubmissionWithDetail) {
	const latestOcr = sub.ocr_runs[0] ?? null
	const latestGrading = sub.grading_runs[0] ?? null

	const status = deriveScanStatus(
		latestOcr?.status ?? null,
		latestGrading?.status ?? null,
	)
	const error = latestGrading?.error ?? latestOcr?.error ?? null

	const pages = (sub.pages ?? []) as PageEntry[]
	const rawResults = (latestGrading?.grading_results ?? []) as GradingResult[]
	const withRegions = mergeRegionsIntoResults(rawResults, sub.answer_regions)

	type McqOption = { option_label: string; option_text: string }
	const mcqLookup = new Map<
		string,
		{ options: McqOption[]; correctLabels: string[] }
	>()
	const stimuliLookup = new Map<
		string,
		Array<{
			label: string
			content: string
			content_type: "text" | "image" | "table"
		}>
	>()
	const examPaperQuestions: Array<{
		question_id: string
		question_number: string
		question_text: string
		max_score: number
		marking_method: "deterministic" | "point_based" | null
		multiple_choice_options: McqOption[]
		correct_option_labels: string[]
	}> = []

	for (const section of sub.exam_paper?.sections ?? []) {
		for (const esq of section.exam_section_questions) {
			const q = esq.question
			const options = Array.isArray(q.multiple_choice_options)
				? (q.multiple_choice_options as McqOption[])
				: []
			const correctLabels = q.mark_schemes[0]?.correct_option_labels ?? []

			if (q.question_type === "multiple_choice") {
				mcqLookup.set(q.id, { options, correctLabels })
			}
			if (q.question_stimuli.length > 0) {
				stimuliLookup.set(
					q.id,
					q.question_stimuli.map((qs) => ({
						label: qs.stimulus.label,
						content: qs.stimulus.content,
						content_type: qs.stimulus.content_type,
					})),
				)
			}

			examPaperQuestions.push({
				question_id: q.id,
				question_number: q.question_number ?? "",
				question_text: q.text,
				max_score: q.points ?? 0,
				marking_method:
					q.question_type === "multiple_choice" ? "deterministic" : null,
				multiple_choice_options: options,
				correct_option_labels: correctLabels,
			})
		}
	}
	const overrideByQuestion = new Map(
		sub.teacher_overrides.map((o) => [o.question_id, o.score_override]),
	)
	const gradingResults = withRegions.map((r) => {
		const mcq = mcqLookup.get(r.question_id)
		const stimuli = stimuliLookup.get(r.question_id)
		const override = overrideByQuestion.get(r.question_id)
		const next = { ...r }
		if (override !== undefined) next.awarded_score = override
		if (mcq) {
			next.multiple_choice_options = mcq.options
			next.correct_option_labels = mcq.correctLabels
		}
		if (stimuli) next.stimuli = stimuli
		return next
	})
	const totalAwarded = gradingResults.reduce((s, r) => s + r.awarded_score, 0)
	const totalMax = sumPaperPoints(sub.exam_paper?.sections ?? [])
	const rawExtracted = latestOcr?.extracted_answers_raw as RawExtracted | null
	const extractedAnswers = rawExtracted?.answers ?? null

	const ocrEvents = (latestOcr?.job_events as JobEvent[] | null) ?? []
	const gradingEvents = (latestGrading?.job_events as JobEvent[] | null) ?? []
	const allEvents = [...ocrEvents, ...gradingEvents].sort((a, b) =>
		a.at < b.at ? -1 : a.at > b.at ? 1 : 0,
	)

	return {
		status,
		error,
		student_name: sub.student_name,
		student_id: sub.student_id,
		detected_subject: sub.detected_subject,
		pages_count: pages.length,
		grading_results: gradingResults,
		exam_paper_title: sub.exam_paper?.title ?? null,
		exam_paper_id: sub.exam_paper_id,
		total_awarded: totalAwarded,
		total_max: totalMax,
		created_at: sub.created_at,
		extracted_answers: extractedAnswers,
		job_events: allEvents.length > 0 ? allEvents : null,
		examiner_summary: latestGrading?.examiner_summary ?? null,
		annotation_status: deriveAnnotationStatus(latestGrading),
		level_descriptors: sub.exam_paper?.level_descriptors ?? null,
		tier: sub.exam_paper?.tier ?? null,
		grade_boundaries: parseStoredBoundaries(sub.exam_paper?.grade_boundaries),
		grade_boundary_mode: sub.exam_paper?.grade_boundary_mode ?? null,
		submission_id: sub.id,
		ocr_run_id: latestOcr?.id,
		grading_run_id: latestGrading?.id,
		ocr_llm_snapshot: latestOcr?.llm_snapshot ?? null,
		grading_llm_snapshot: latestGrading?.llm_snapshot ?? null,
		annotation_llm_snapshot: latestGrading?.annotation_llm_snapshot ?? null,
		exam_paper_questions:
			examPaperQuestions.length > 0 ? examPaperQuestions : null,
	}
}

export const getStudentPaperJob = resourceAction({
	type: "submission",
	role: "viewer",
	schema: z.object({ jobId: z.string() }),
	id: ({ jobId }) => jobId,
}).action(
	async ({
		parsedInput: { jobId },
	}): Promise<{ data: ReturnType<typeof toJobPayload> | null }> => {
		const sub = await db.studentSubmission.findFirst({
			where: { id: jobId },
			include: submissionDetailInclude,
		})
		if (!sub) return { data: null }
		return { data: toJobPayload(sub) }
	},
)

/**
 * Fetches a student paper job while validating it belongs to the given exam
 * paper. Provides a security invariant that the job is from the expected
 * paper context.
 */
export const getStudentPaperJobForPaper = resourcesAction({
	schema: z.object({ examPaperId: z.string(), jobId: z.string() }),
	resources: [
		{ type: "submission", role: "viewer", id: ({ jobId }) => jobId },
		{ type: "examPaper", role: "viewer", id: ({ examPaperId }) => examPaperId },
	],
}).action(
	async ({
		parsedInput: { examPaperId, jobId },
	}): Promise<{ data: ReturnType<typeof toJobPayload> | null }> => {
		const sub = await db.studentSubmission.findFirst({
			where: {
				id: jobId,
				exam_paper_id: examPaperId,
			},
			include: submissionDetailInclude,
		})
		if (!sub) return { data: null }
		return { data: toJobPayload(sub) }
	},
)

async function loadClassAnnotations(
	submissionIds: string[],
	latestGradingRunIdBySubmission: Record<string, string | null>,
): Promise<Record<string, StudentPaperAnnotation[]>> {
	const latestRunIds = Object.values(latestGradingRunIdBySubmission).filter(
		(id): id is string => id !== null,
	)

	const rows = await db.studentPaperAnnotation.findMany({
		where: {
			deleted_at: null,
			OR: [
				{ submission_id: { in: submissionIds }, source: "teacher" },
				...(latestRunIds.length > 0
					? [{ grading_run_id: { in: latestRunIds } }]
					: []),
			],
		},
		orderBy: [{ page_order: "asc" }, { sort_order: "asc" }],
	})

	const out: Record<string, StudentPaperAnnotation[]> = {}
	for (const id of submissionIds) out[id] = []

	for (const row of rows) {
		let payload: AnyAnnotationPayload
		try {
			payload = parseAnnotationPayload(
				row.overlay_type as OverlayType,
				row.payload,
			)
		} catch {
			payload = { _v: 1, signal: "tick", reason: "" } as AnyAnnotationPayload
		}

		const annotation = {
			id: row.id,
			grading_run_id: row.grading_run_id,
			question_id: row.question_id,
			page_order: row.page_order,
			overlay_type: row.overlay_type as OverlayType,
			sentiment: row.sentiment,
			payload,
			bbox: row.bbox as [number, number, number, number],
			anchor_token_start_id: row.anchor_token_start_id,
			anchor_token_end_id: row.anchor_token_end_id,
		} as StudentPaperAnnotation

		const list = out[row.submission_id]
		if (list) list.push(annotation)
	}

	return out
}

async function loadClassTokens(
	submissionIds: string[],
): Promise<Record<string, PageToken[]>> {
	const rows = await db.studentPaperPageToken.findMany({
		where: { submission_id: { in: submissionIds } },
		select: {
			id: true,
			submission_id: true,
			page_order: true,
			para_index: true,
			line_index: true,
			word_index: true,
			text_raw: true,
			text_corrected: true,
			bbox: true,
			confidence: true,
			question_id: true,
			answer_char_start: true,
			answer_char_end: true,
		},
	})

	const bySubmission = new Map<string, Map<number, PageToken[]>>()
	for (const row of rows) {
		const token: PageToken = {
			id: row.id,
			page_order: row.page_order,
			para_index: row.para_index,
			line_index: row.line_index,
			word_index: row.word_index,
			text_raw: row.text_raw,
			text_corrected: row.text_corrected,
			bbox: row.bbox as [number, number, number, number],
			confidence: row.confidence,
			question_id: row.question_id,
			answer_char_start: row.answer_char_start,
			answer_char_end: row.answer_char_end,
		}
		const subMap = bySubmission.get(row.submission_id) ?? new Map()
		const pageList = subMap.get(row.page_order) ?? []
		pageList.push(token)
		subMap.set(row.page_order, pageList)
		bySubmission.set(row.submission_id, subMap)
	}

	const out: Record<string, PageToken[]> = {}
	for (const id of submissionIds) out[id] = []
	for (const [subId, pageMap] of bySubmission) {
		out[subId] = Array.from(pageMap.keys())
			.sort((a, b) => a - b)
			.flatMap((p) => sortTokensSpatially(pageMap.get(p) ?? []))
	}
	return out
}

const classPapersInput = z.object({
	examPaperId: z.string(),
	submissionIds: z.array(z.string()).min(1, "No submissions selected"),
	includeAnnotations: z.boolean().optional(),
})

type ClassPapersResult = {
	payloads: StudentPaperResultPayload[]
	annotationsBySubmission: Record<string, StudentPaperAnnotation[]>
	tokensBySubmission: Record<string, PageToken[]>
}

export const getStudentPapersForClass = resourcesAction({
	schema: classPapersInput,
	resources: [
		{ type: "examPaper", role: "viewer", id: ({ examPaperId }) => examPaperId },
		{
			type: "submission",
			role: "viewer",
			ids: ({ submissionIds }) => submissionIds,
		},
	],
}).action(
	async ({
		parsedInput: { examPaperId, submissionIds, includeAnnotations },
	}): Promise<ClassPapersResult> => {
		const subs = await db.studentSubmission.findMany({
			where: {
				id: { in: submissionIds },
				exam_paper_id: examPaperId,
				superseded_at: null,
			},
			orderBy: { created_at: "asc" },
			include: submissionDetailInclude,
		})

		const payloads = subs.map(toJobPayload)

		let annotationsBySubmission: Record<string, StudentPaperAnnotation[]> = {}
		let tokensBySubmission: Record<string, PageToken[]> = {}

		if (includeAnnotations) {
			const fetchedIds = subs.map((s) => s.id)
			const latestGradingRunIdBySubmission: Record<string, string | null> =
				Object.fromEntries(
					subs.map((s) => [s.id, s.grading_runs[0]?.id ?? null]),
				)

			const [annotations, tokens] = await Promise.all([
				loadClassAnnotations(fetchedIds, latestGradingRunIdBySubmission),
				loadClassTokens(fetchedIds),
			])
			annotationsBySubmission = annotations
			tokensBySubmission = tokens
		}

		return {
			payloads,
			annotationsBySubmission,
			tokensBySubmission,
		}
	},
)

export type SubmissionVersion = {
	id: string
	created_at: Date
	superseded_at: Date | null
	supersede_reason: string | null
	status: string
}

/**
 * Finds all versions of a submission (current + superseded).
 * Groups by s3_key — re-scans and re-marks copy the same s3_key,
 * so all versions of the same student's paper share it.
 */
export const getSubmissionVersions = resourceAction({
	type: "submission",
	role: "viewer",
	schema: z.object({ jobId: z.string() }),
	id: ({ jobId }) => jobId,
}).action(
	async ({
		parsedInput: { jobId },
	}): Promise<{ versions: SubmissionVersion[] }> => {
		const current = await db.studentSubmission.findFirst({
			where: { id: jobId },
			select: { s3_key: true, exam_paper_id: true },
		})
		if (!current) throw new Error("Submission not found")

		const siblings = await db.studentSubmission.findMany({
			where: {
				s3_key: current.s3_key,
				exam_paper_id: current.exam_paper_id,
			},
			orderBy: { created_at: "desc" },
			select: {
				id: true,
				created_at: true,
				superseded_at: true,
				supersede_reason: true,
				ocr_runs: {
					orderBy: { created_at: "desc" as const },
					take: 1,
					select: { status: true },
				},
				grading_runs: {
					orderBy: { created_at: "desc" as const },
					take: 1,
					select: { status: true },
				},
			},
		})

		return {
			versions: siblings.map((s) => ({
				id: s.id,
				created_at: s.created_at,
				superseded_at: s.superseded_at,
				supersede_reason: s.supersede_reason,
				status: deriveScanStatus(
					(s.ocr_runs[0]?.status ?? null) as Parameters<
						typeof deriveScanStatus
					>[0],
					(s.grading_runs[0]?.status ?? null) as Parameters<
						typeof deriveScanStatus
					>[1],
				),
			})),
		}
	},
)

export const getTeacherOverrides = resourceAction({
	type: "submission",
	role: "viewer",
	schema: z.object({ submissionId: z.string() }),
	id: ({ submissionId }) => submissionId,
}).action(
	async ({
		parsedInput: { submissionId },
	}): Promise<{ overrides: TeacherOverride[] }> => {
		const rows = await db.teacherOverride.findMany({
			where: { submission_id: submissionId },
		})

		return {
			overrides: rows.map((r) => ({
				id: r.id,
				submission_id: r.submission_id,
				question_id: r.question_id,
				score_override: r.score_override,
				reason: r.reason,
				feedback_override: r.feedback_override,
				created_at: r.created_at,
				updated_at: r.updated_at,
			})),
		}
	},
)

export const getSubmissionFeedback = resourceAction({
	type: "submission",
	role: "viewer",
	schema: z.object({ submissionId: z.string() }),
	id: ({ submissionId }) => submissionId,
}).action(
	async ({
		parsedInput: { submissionId },
		ctx,
	}): Promise<{ feedback: SubmissionFeedback | null }> => {
		const row = await db.submissionFeedback.findUnique({
			where: {
				submission_id_created_by: {
					submission_id: submissionId,
					created_by: ctx.user.id,
				},
			},
		})
		return { feedback: row ? toSubmissionFeedback(row) : null }
	},
)
