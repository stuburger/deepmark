"use server"

import { authenticatedAction } from "@/lib/authz"
import {
	examPaperAccessWhere,
	submissionAccessWhere,
} from "@/lib/authz/where-clauses"
import { db } from "@/lib/db"
import type { DashboardData, DashboardPaper, PaperStatus } from "./types"

type SubmissionBucket = "marking" | "review" | "done"

/**
 * Paper lifecycle (evaluated top-down, first match wins):
 *   setup   → questions == 0 OR any question is missing a mark scheme
 *   ready   → setup-complete, no submissions yet
 *   marking → has submissions, at least one not yet AI-complete
 *   review  → all submissions AI-complete, at least one not confirmed
 *   done    → all submissions confirmed (confirmed_at is set)
 *
 * `gradingStatus === "complete"` means *AI* complete, not workflow complete.
 */
function submissionBucket(
	aiGradingStatus: string | null,
	confirmedAt: Date | null,
): SubmissionBucket {
	if (confirmedAt != null) return "done"
	if (aiGradingStatus === "complete") return "review"
	return "marking"
}

function paperStatusFromSubmissionBuckets(
	buckets: SubmissionBucket[],
): "marking" | "review" | "done" {
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
				confirmed_at: true,
				grading_runs: {
					orderBy: { created_at: "desc" },
					take: 1,
					select: { status: true },
				},
			},
		})

		const counts = { review: 0, marking: 0, done: 0 }
		const bucketsByPaper = new Map<string, SubmissionBucket[]>()
		const submissionCountByPaper = new Map<string, number>()
		const aiCompleteCountByPaper = new Map<string, number>()
		const confirmedCountByPaper = new Map<string, number>()
		const lastActivityByPaper = new Map<string, number>()

		for (const sub of submissions) {
			const aiGradingStatus = sub.grading_runs[0]?.status ?? null
			const bucket = submissionBucket(aiGradingStatus, sub.confirmed_at)
			counts[bucket]++
			const arr = bucketsByPaper.get(sub.exam_paper_id) ?? []
			arr.push(bucket)
			bucketsByPaper.set(sub.exam_paper_id, arr)
			submissionCountByPaper.set(
				sub.exam_paper_id,
				(submissionCountByPaper.get(sub.exam_paper_id) ?? 0) + 1,
			)
			if (aiGradingStatus === "complete") {
				aiCompleteCountByPaper.set(
					sub.exam_paper_id,
					(aiCompleteCountByPaper.get(sub.exam_paper_id) ?? 0) + 1,
				)
			}
			if (sub.confirmed_at != null) {
				confirmedCountByPaper.set(
					sub.exam_paper_id,
					(confirmedCountByPaper.get(sub.exam_paper_id) ?? 0) + 1,
				)
			}
			const ts = (sub.confirmed_at ?? sub.created_at).getTime()
			const prev = lastActivityByPaper.get(sub.exam_paper_id) ?? 0
			if (ts > prev) lastActivityByPaper.set(sub.exam_paper_id, ts)
		}

		const paperWhere = await examPaperAccessWhere(ctx.user, "viewer")
		const papers = await db.examPaper.findMany({
			where: paperWhere,
			orderBy: [{ created_at: "desc" }],
			take: 24,
			select: {
				id: true,
				title: true,
				subject: true,
				created_at: true,
			},
		})

		// All 24 are returned for the "Recent marking" grid. The card component
		// shows 6 by default and reveals the rest behind "Show more"; anything
		// beyond 24 lives on /teacher/exam-papers.
		const sorted = papers
			.map((p) => ({
				paper: p,
				lastActivity: lastActivityByPaper.get(p.id) ?? p.created_at.getTime(),
			}))
			.sort((a, b) => b.lastActivity - a.lastActivity)

		// Strict setup-complete check: every question on a paper must have at
		// least one mark scheme attached. Pulled in one round-trip so the per-
		// paper card state can be derived without N+1.
		const visiblePaperIds = sorted.map(({ paper }) => paper.id)
		const sectionRows = visiblePaperIds.length
			? await db.examSection.findMany({
					where: { exam_paper_id: { in: visiblePaperIds } },
					select: {
						exam_paper_id: true,
						exam_section_questions: {
							select: {
								question: {
									select: { _count: { select: { mark_schemes: true } } },
								},
							},
						},
					},
				})
			: []

		const questionCountByPaper = new Map<string, number>()
		const questionsWithMsByPaper = new Map<string, number>()
		for (const sec of sectionRows) {
			for (const esq of sec.exam_section_questions) {
				questionCountByPaper.set(
					sec.exam_paper_id,
					(questionCountByPaper.get(sec.exam_paper_id) ?? 0) + 1,
				)
				if (esq.question._count.mark_schemes > 0) {
					questionsWithMsByPaper.set(
						sec.exam_paper_id,
						(questionsWithMsByPaper.get(sec.exam_paper_id) ?? 0) + 1,
					)
				}
			}
		}

		const recentPapers: DashboardPaper[] = sorted.map(({ paper }) => {
			const total = submissionCountByPaper.get(paper.id) ?? 0
			const aiComplete = aiCompleteCountByPaper.get(paper.id) ?? 0
			const confirmed = confirmedCountByPaper.get(paper.id) ?? 0
			const questions = questionCountByPaper.get(paper.id) ?? 0
			const questionsWithMs = questionsWithMsByPaper.get(paper.id) ?? 0
			const setupComplete = questions > 0 && questionsWithMs === questions

			let status: PaperStatus
			if (!setupComplete) {
				status = "setup"
			} else if (total === 0) {
				status = "ready"
			} else {
				status = paperStatusFromSubmissionBuckets(
					bucketsByPaper.get(paper.id) ?? [],
				)
			}

			// Bar fills with the next-step completion: AI-grading progress while
			// the paper is being marked, teacher-confirmation progress once AI
			// is done, full once every script is signed off. Pre-submission
			// states (setup / ready) sit at 0 until work begins.
			const progress =
				status === "marking"
					? Math.round((aiComplete / total) * 100)
					: status === "review"
						? Math.round((confirmed / total) * 100)
						: status === "done"
							? 100
							: 0

			return {
				id: paper.id,
				title: paper.title,
				subject: paper.subject,
				scriptCount: total,
				status,
				progress,
			}
		})

		return {
			displayName: deriveDisplayName(userRecord),
			counts,
			recentPapers,
		}
	},
)
