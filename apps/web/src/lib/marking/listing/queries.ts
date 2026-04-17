"use server"

import { db } from "@/lib/db"
import type { GradingStatus, OcrStatus } from "@mcp-gcse/db"
import { auth } from "../../auth"
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

function mapSubmissionToListItem(sub: {
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
}): SubmissionHistoryItem {
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
		total_max: results.reduce((s, r) => s + r.max_score, 0),
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

	return { ok: true, submissions: subs.map(mapSubmissionToListItem) }
}

export async function listSubmissionsForPaper(
	examPaperId: string,
): Promise<ListMySubmissionsResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const subs = await db.studentSubmission.findMany({
		where: {
			exam_paper_id: examPaperId,
			superseded_at: null,
		},
		orderBy: { created_at: "desc" },
		include: listingInclude,
	})

	// Count superseded siblings per s3_key in a single query
	const s3Keys = subs.map((s) => s.s3_key)
	const versionCounts =
		s3Keys.length > 0
			? await db.studentSubmission.groupBy({
					by: ["s3_key"],
					where: {
						exam_paper_id: examPaperId,
						s3_key: { in: s3Keys },
					},
					_count: true,
				})
			: []
	const countByKey = new Map(versionCounts.map((v) => [v.s3_key, v._count]))

	return {
		ok: true,
		submissions: subs.map((sub) => ({
			...mapSubmissionToListItem(sub),
			version_count: countByKey.get(sub.s3_key) ?? 1,
		})),
	}
}
