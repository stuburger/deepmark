"use server"

import { authenticatedAction } from "@/lib/authz"
import {
	examPaperAccessWhere,
	submissionAccessWhere,
} from "@/lib/authz/where-clauses"
import { db } from "@/lib/db"
import type { DashboardData, DashboardPaper, PaperStatus } from "./types"

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

type SubmissionBucket = "marking" | "review" | "done"

function bucketSubmission(
	gradingStatus: string | null,
	createdAt: Date,
	now: number,
): SubmissionBucket {
	if (gradingStatus === "complete") {
		const ageMs = now - createdAt.getTime()
		return ageMs <= SEVEN_DAYS_MS ? "review" : "done"
	}
	return "marking"
}

function paperStatusFromBuckets(buckets: SubmissionBucket[]): PaperStatus {
	if (buckets.length === 0) return "marking"
	if (buckets.includes("marking")) return "marking"
	if (buckets.includes("review")) return "review"
	return "done"
}

function deriveDisplayName(
	user: { name: string | null; email: string | null } | null,
): string {
	const raw = user?.name?.trim() ?? user?.email?.split("@")[0] ?? "there"
	const firstWord = raw.split(/[\s_.-]/)[0] ?? raw
	return firstWord.charAt(0).toUpperCase() + firstWord.slice(1)
}

export const getDashboardData = authenticatedAction.action(
	async ({ ctx }): Promise<DashboardData> => {
		const userRecord = await db.user.findUnique({
			where: { id: ctx.user.id },
			select: { name: true, email: true },
		})

		const submissionWhere = await submissionAccessWhere(ctx.user, "viewer")
		const submissions = await db.studentSubmission.findMany({
			where: { superseded_at: null, ...submissionWhere },
			select: {
				exam_paper_id: true,
				created_at: true,
				grading_runs: {
					orderBy: { created_at: "desc" },
					take: 1,
					select: { status: true },
				},
			},
		})

		const now = Date.now()
		const counts = { review: 0, marking: 0, done: 0 }
		const bucketsByPaper = new Map<string, SubmissionBucket[]>()
		const submissionCountByPaper = new Map<string, number>()
		const lastActivityByPaper = new Map<string, number>()

		for (const sub of submissions) {
			const bucket = bucketSubmission(
				sub.grading_runs[0]?.status ?? null,
				sub.created_at,
				now,
			)
			counts[bucket]++
			const arr = bucketsByPaper.get(sub.exam_paper_id) ?? []
			arr.push(bucket)
			bucketsByPaper.set(sub.exam_paper_id, arr)
			submissionCountByPaper.set(
				sub.exam_paper_id,
				(submissionCountByPaper.get(sub.exam_paper_id) ?? 0) + 1,
			)
			const ts = sub.created_at.getTime()
			const prev = lastActivityByPaper.get(sub.exam_paper_id) ?? 0
			if (ts > prev) lastActivityByPaper.set(sub.exam_paper_id, ts)
		}

		const paperWhere = await examPaperAccessWhere(ctx.user, "viewer")
		const papers = await db.examPaper.findMany({
			where: paperWhere,
			orderBy: [{ created_at: "desc" }],
			take: 12,
			select: {
				id: true,
				title: true,
				subject: true,
				created_at: true,
			},
		})

		const sorted = papers
			.map((p) => ({
				paper: p,
				lastActivity: lastActivityByPaper.get(p.id) ?? p.created_at.getTime(),
			}))
			.sort((a, b) => b.lastActivity - a.lastActivity)
			.slice(0, 6)

		const recentPapers: DashboardPaper[] = sorted.map(({ paper }) => ({
			id: paper.id,
			title: paper.title,
			subject: paper.subject,
			scriptCount: submissionCountByPaper.get(paper.id) ?? 0,
			status: paperStatusFromBuckets(bucketsByPaper.get(paper.id) ?? []),
		}))

		return {
			displayName: deriveDisplayName(userRecord),
			counts,
			recentPapers,
		}
	},
)
