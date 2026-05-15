"use server"

import { resourceAction, scopedAction } from "@/lib/authz"
import { db } from "@/lib/db"
import type { GradingStatus, OcrStatus } from "@mcp-gcse/db"
import { z } from "zod"
import { sumSectionPoints } from "../paper-totals"
import { deriveScanStatus } from "../status"
import type { GradingResult, SubmissionHistoryItem } from "../types"

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

async function fetchPaperTotals(
	paperIds: string[],
): Promise<Map<string, number>> {
	if (paperIds.length === 0) return new Map()
	const sections = await db.examSection.findMany({
		where: { exam_paper_id: { in: paperIds } },
		select: {
			exam_paper_id: true,
			choice_kind: true,
			choice_n: true,
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
		student_id: string | null
		detected_student_number: string | null
		exam_paper_id: string
		detected_subject: string | null
		created_at: Date
		confirmed_at: Date | null
		exam_paper: { id: string; title: string } | null
		grading_runs: Array<{
			status: GradingStatus
			grading_results: unknown
		}>
		ocr_runs: Array<{ status: OcrStatus }>
		teacher_overrides: Array<{ question_id: string; score_override: number }>
	},
	paperTotal: number,
	isBookmarked: boolean,
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
		student_id: sub.student_id,
		detected_student_number: sub.detected_student_number,
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
		is_confirmed: sub.confirmed_at !== null,
		is_bookmarked: isBookmarked,
	}
}

type ListItemWithVersions = SubmissionHistoryItem & { version_count: number }

async function fetchVersionCounts(
	stagedScriptIds: string[],
): Promise<Map<string, number>> {
	if (stagedScriptIds.length === 0) return new Map()
	const rows = await db.studentSubmission.groupBy({
		by: ["staged_script_id"],
		where: { staged_script_id: { in: stagedScriptIds } },
		_count: true,
	})
	return new Map(rows.map((r) => [r.staged_script_id, r._count]))
}

export const listMySubmissions = scopedAction({
	scope: "submission",
	role: "viewer",
}).action(async ({ ctx }): Promise<{ submissions: ListItemWithVersions[] }> => {
	const subs = await db.studentSubmission.findMany({
		where: { superseded_at: null, ...ctx.accessWhere },
		orderBy: { created_at: "desc" },
		include: listingInclude,
	})

	const paperIds = [...new Set(subs.map((s) => s.exam_paper_id))]
	const submissionIds = subs.map((s) => s.id)
	const stagedScriptIds = subs.map((s) => s.staged_script_id)
	const [paperTotals, bookmarks, versionCounts] = await Promise.all([
		fetchPaperTotals(paperIds),
		db.studentSubmissionBookmark.findMany({
			where: {
				user_id: ctx.user.id,
				submission_id: { in: submissionIds },
			},
			select: { submission_id: true },
		}),
		fetchVersionCounts(stagedScriptIds),
	])
	const bookmarkedSet = new Set(bookmarks.map((b) => b.submission_id))

	return {
		submissions: subs.map((sub) => ({
			...mapSubmissionToListItem(
				sub,
				paperTotals.get(sub.exam_paper_id) ?? 0,
				bookmarkedSet.has(sub.id),
			),
			version_count: versionCounts.get(sub.staged_script_id) ?? 1,
		})),
	}
})

/**
 * Submissions whose staged_script has *any* bookmarked version (not just the
 * current one). Bookmarking v1 and then regrading creates v2 — without this
 * staged_script-aware filter, the bookmark would silently vanish from the
 * bookmarks list because v1 is superseded. `is_bookmarked` on the returned
 * row reflects the *current* version's bookmark state; expanded version rows
 * carry their own per-version bookmark flag.
 */
export const listBookmarkedSubmissions = scopedAction({
	scope: "submission",
	role: "viewer",
}).action(async ({ ctx }): Promise<{ submissions: ListItemWithVersions[] }> => {
	const userBookmarks = await db.studentSubmissionBookmark.findMany({
		where: { user_id: ctx.user.id },
		select: { submission: { select: { staged_script_id: true } } },
	})
	const stagedScriptIds = [
		...new Set(userBookmarks.map((b) => b.submission.staged_script_id)),
	]
	if (stagedScriptIds.length === 0) return { submissions: [] }

	const subs = await db.studentSubmission.findMany({
		where: {
			staged_script_id: { in: stagedScriptIds },
			superseded_at: null,
			...ctx.accessWhere,
		},
		orderBy: { created_at: "desc" },
		include: listingInclude,
	})

	const paperIds = [...new Set(subs.map((s) => s.exam_paper_id))]
	const submissionIds = subs.map((s) => s.id)
	const [paperTotals, currentBookmarks, versionCounts] = await Promise.all([
		fetchPaperTotals(paperIds),
		db.studentSubmissionBookmark.findMany({
			where: {
				user_id: ctx.user.id,
				submission_id: { in: submissionIds },
			},
			select: { submission_id: true },
		}),
		fetchVersionCounts(stagedScriptIds),
	])
	const bookmarkedSet = new Set(currentBookmarks.map((b) => b.submission_id))

	return {
		submissions: subs.map((sub) => ({
			...mapSubmissionToListItem(
				sub,
				paperTotals.get(sub.exam_paper_id) ?? 0,
				bookmarkedSet.has(sub.id),
			),
			version_count: versionCounts.get(sub.staged_script_id) ?? 1,
		})),
	}
})

export const listSubmissionsForPaper = resourceAction({
	type: "examPaper",
	role: "viewer",
	schema: z.object({ examPaperId: z.string() }),
	id: ({ examPaperId }) => examPaperId,
}).action(
	async ({
		parsedInput: { examPaperId },
		ctx,
	}): Promise<{
		submissions: (SubmissionHistoryItem & { version_count: number })[]
	}> => {
		const { submissionAccessWhere } = await import("@/lib/authz")
		const accessWhere = await submissionAccessWhere(ctx.user, "viewer")

		const [subs, paperTotals, versionCounts] = await Promise.all([
			db.studentSubmission.findMany({
				where: {
					exam_paper_id: examPaperId,
					superseded_at: null,
					...accessWhere,
				},
				orderBy: { created_at: "desc" },
				include: listingInclude,
			}),
			fetchPaperTotals([examPaperId]),
			db.studentSubmission.groupBy({
				by: ["staged_script_id"],
				where: { exam_paper_id: examPaperId },
				_count: true,
			}),
		])

		const bookmarks = await db.studentSubmissionBookmark.findMany({
			where: {
				user_id: ctx.user.id,
				submission_id: { in: subs.map((s) => s.id) },
			},
			select: { submission_id: true },
		})
		const bookmarkedSet = new Set(bookmarks.map((b) => b.submission_id))

		const paperTotal = paperTotals.get(examPaperId) ?? 0
		const countByKey = new Map(
			versionCounts.map((v) => [v.staged_script_id, v._count]),
		)

		return {
			submissions: subs.map((sub) => ({
				...mapSubmissionToListItem(sub, paperTotal, bookmarkedSet.has(sub.id)),
				version_count: countByKey.get(sub.staged_script_id) ?? 1,
			})),
		}
	},
)
