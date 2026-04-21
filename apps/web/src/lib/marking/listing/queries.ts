"use server"

import { db } from "@/lib/db"
import type { GradingStatus, OcrStatus } from "@mcp-gcse/db"
import { auth } from "../../auth"
import { sumSectionPoints } from "../paper-totals"
import { deriveScanStatus } from "../status"
import type {
	GradingResult,
	ListMySubmissionsResult,
	SubmissionHistoryItem,
} from "../types"

const listingInclude = {
	exam_paper: { select: { id: true, title: true } },
	grading_runs: {
		orderBy: { created_at: "desc" as const },
		take: 1,
		select: { status: true, grading_results: true },
	},
	ocr_runs: {
		orderBy: { created_at: "desc" as const },
		take: 1,
		select: { status: true },
	},
	teacher_overrides: {
		select: { question_id: true, score_override: true },
	},
} as const

/**
 * Batch-fetch the total available marks for each exam paper.
 * `total_max` in the UI should reflect the paper's invariant (sum of
 * questions.points across all questions), NOT the sum across whichever
 * questions happened to be graded — otherwise a partially-graded submission
 * displays "3/3 · 100%" when the student actually earned 3 out of 43.
 */
async function fetchPaperTotals(
	paperIds: string[],
): Promise<Map<string, number>> {
	if (paperIds.length === 0) return new Map()
	const sections = await db.examSection.findMany({
		where: { exam_paper_id: { in: paperIds } },
		select: {
			exam_paper_id: true,
			exam_section_questions: {
				select: { question: { select: { points: true } } },
			},
		},
	})
	const totals = new Map<string, number>()
	for (const section of sections) {
		totals.set(
			section.exam_paper_id,
			(totals.get(section.exam_paper_id) ?? 0) + sumSectionPoints(section),
		)
	}
	return totals
}

function mapSubmissionToListItem(
	sub: {
		id: string
		student_name: string | null
		exam_paper_id: string
		detected_subject: string | null
		created_at: Date
		exam_paper: { id: string; title: string } | null
		grading_runs: Array<{
			status: GradingStatus
			grading_results: unknown
		}>
		ocr_runs: Array<{ status: OcrStatus }>
		teacher_overrides: Array<{ question_id: string; score_override: number }>
	},
	paperTotal: number,
): SubmissionHistoryItem {
	const latestGrading = sub.grading_runs[0]
	const latestOcr = sub.ocr_runs[0]
	const results = (latestGrading?.grading_results ?? []) as GradingResult[]
	const status = deriveScanStatus(
		latestOcr?.status ?? null,
		latestGrading?.status ?? null,
	)

	const overrideByQuestion = new Map(
		sub.teacher_overrides.map((o) => [o.question_id, o.score_override]),
	)

	return {
		id: sub.id,
		student_name: sub.student_name,
		exam_paper_id: sub.exam_paper_id,
		exam_paper_title: sub.exam_paper?.title ?? null,
		detected_subject: sub.detected_subject,
		total_awarded: results.reduce((s, r) => {
			const override = overrideByQuestion.get(r.question_id)
			return s + (override ?? r.awarded_score)
		}, 0),
		total_max: paperTotal,
		status,
		created_at: sub.created_at,
	}
}

export async function listMySubmissions(): Promise<ListMySubmissionsResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const subs = await db.studentSubmission.findMany({
		where: { superseded_at: null },
		orderBy: { created_at: "desc" },
		include: listingInclude,
	})

	const paperIds = [...new Set(subs.map((s) => s.exam_paper_id))]
	const paperTotals = await fetchPaperTotals(paperIds)

	return {
		ok: true,
		submissions: subs.map((sub) =>
			mapSubmissionToListItem(sub, paperTotals.get(sub.exam_paper_id) ?? 0),
		),
	}
}

export async function listSubmissionsForPaper(
	examPaperId: string,
): Promise<ListMySubmissionsResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	// All three queries are independent — version counts groupBy the whole
	// paper (including superseded rows, which the main query filters out),
	// so it doesn't depend on the active-submissions s3_key list. Running
	// them concurrently shaves a round-trip off the list render.
	const [subs, paperTotals, versionCounts] = await Promise.all([
		db.studentSubmission.findMany({
			where: {
				exam_paper_id: examPaperId,
				superseded_at: null,
			},
			orderBy: { created_at: "desc" },
			include: listingInclude,
		}),
		fetchPaperTotals([examPaperId]),
		db.studentSubmission.groupBy({
			by: ["s3_key"],
			where: { exam_paper_id: examPaperId },
			_count: true,
		}),
	])

	const paperTotal = paperTotals.get(examPaperId) ?? 0
	const countByKey = new Map(versionCounts.map((v) => [v.s3_key, v._count]))

	return {
		ok: true,
		submissions: subs.map((sub) => ({
			...mapSubmissionToListItem(sub, paperTotal),
			version_count: countByKey.get(sub.s3_key) ?? 1,
		})),
	}
}
