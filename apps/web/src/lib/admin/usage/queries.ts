"use server"

import { adminAction } from "@/lib/authz"
import { db } from "@/lib/db"
import { Prisma } from "@mcp-gcse/db"
import { estimateCost } from "./pricing"
import type {
	RecentRun,
	UsageAnalyticsData,
	UsageByCallSite,
	UsageByDate,
	UsageByModel,
	UsageByStage,
	UsageByUser,
	UsageSummary,
} from "./types"

const NOT_NULL = { not: Prisma.JsonNull }

// ─── Snapshot parsing ────────────────────────────────────────────────────────

type EffectiveSummary = {
	total_calls: number
	fallback_calls: number
	prompt_tokens: number
	completion_tokens: number
}

type SelectedEntry = {
	model: string
	provider: string
	temperature: number
}

type LlmSnapshot = {
	selected: Record<string, SelectedEntry[]>
	effective: Record<string, EffectiveSummary>
}

function parseSnapshot(raw: unknown): LlmSnapshot | null {
	if (!raw || typeof raw !== "object") return null
	const snap = raw as Record<string, unknown>
	if (!snap.selected || !snap.effective) return null
	return snap as unknown as LlmSnapshot
}

// ─── Raw row types from DB ───────────────────────────────────────────────────

type RawRunRow = {
	id: string
	stage: "ocr" | "grading" | "annotation"
	completed_at: Date | null
	llm_snapshot: unknown
	user_id: string | null
	user_name: string | null
	user_email: string | null
	student_name: string | null
	paper_title: string | null
	submission_id: string
}

// ─── Main query ──────────────────────────────────────────────────────────────

export const getUsageAnalytics = adminAction.action(
	async (): Promise<UsageAnalyticsData> => {
		// Fetch OCR and grading runs with snapshots in parallel. Annotation
		// snapshots are folded into GradingRun.annotation_llm_snapshot — the same
		// row now carries both the grading and annotation traces.
		const [ocrRows, gradingRows] = await Promise.all([
			db.ocrRun.findMany({
				where: { status: "complete", llm_snapshot: NOT_NULL },
				include: {
					submission: {
						include: {
							exam_paper: { select: { title: true } },
							uploader: { select: { id: true, name: true, email: true } },
						},
					},
				},
			}),
			db.gradingRun.findMany({
				where: { status: "complete", llm_snapshot: NOT_NULL },
				include: {
					submission: {
						include: {
							exam_paper: { select: { title: true } },
							uploader: { select: { id: true, name: true, email: true } },
						},
					},
				},
			}),
		])

		// Normalise into a flat array
		const rows: RawRunRow[] = [
			...ocrRows.map((r) => ({
				id: r.id,
				stage: "ocr" as const,
				completed_at: r.completed_at,
				llm_snapshot: r.llm_snapshot,
				user_id: r.submission.uploader?.id ?? null,
				user_name: r.submission.uploader?.name ?? null,
				user_email: r.submission.uploader?.email ?? null,
				student_name: r.submission.student_name,
				paper_title: r.submission.exam_paper?.title ?? null,
				submission_id: r.submission_id,
			})),
			...gradingRows.map((r) => ({
				id: r.id,
				stage: "grading" as const,
				completed_at: r.completed_at,
				llm_snapshot: r.llm_snapshot,
				user_id: r.submission.uploader?.id ?? null,
				user_name: r.submission.uploader?.name ?? null,
				user_email: r.submission.uploader?.email ?? null,
				student_name: r.submission.student_name,
				paper_title: r.submission.exam_paper?.title ?? null,
				submission_id: r.submission_id,
			})),
			...gradingRows
				.filter((r) => r.annotation_llm_snapshot !== null)
				.map((r) => ({
					id: r.id,
					stage: "annotation" as const,
					completed_at: r.annotations_completed_at ?? r.completed_at,
					llm_snapshot: r.annotation_llm_snapshot,
					user_id: r.submission.uploader?.id ?? null,
					user_name: r.submission.uploader?.name ?? null,
					user_email: r.submission.uploader?.email ?? null,
					student_name: r.submission.student_name,
					paper_title: r.submission.exam_paper?.title ?? null,
					submission_id: r.submission_id,
				})),
		]

		// Parse snapshots and aggregate
		const stageMap = new Map<string, UsageByStage>()
		const callSiteMap = new Map<string, UsageByCallSite>()
		const modelMap = new Map<string, UsageByModel>()
		const dateMap = new Map<string, UsageByDate>()
		const userMap = new Map<string, UsageByUser>()
		const recentRuns: RecentRun[] = []

		// Track unique grading submissions for papers_marked count
		const gradingSubmissions = new Set<string>()

		let totalPrompt = 0
		let totalCompletion = 0
		let totalCost = 0

		for (const row of rows) {
			const snap = parseSnapshot(row.llm_snapshot)
			if (!snap) continue

			if (row.stage === "grading") {
				gradingSubmissions.add(row.submission_id)
			}

			let runPrompt = 0
			let runCompletion = 0
			let runCalls = 0
			let runModel = ""
			const runCallSites: RecentRun["call_sites"] = []

			// Process each call site in the snapshot
			for (const [callSite, eff] of Object.entries(snap.effective)) {
				const prompt = eff.prompt_tokens ?? 0
				const completion = eff.completion_tokens ?? 0
				runPrompt += prompt
				runCompletion += completion
				runCalls += eff.total_calls ?? 0

				// Get model info from selected
				const selected = snap.selected[callSite]?.[0]
				const model = selected?.model ?? "unknown"
				const provider = selected?.provider ?? "unknown"
				if (!runModel) runModel = model

				const cost = estimateCost(model, prompt, completion)
				totalCost += cost

				// By stage
				const stageKey = row.stage
				const existing = stageMap.get(stageKey) ?? {
					stage: stageKey,
					prompt_tokens: 0,
					completion_tokens: 0,
				}
				existing.prompt_tokens += prompt
				existing.completion_tokens += completion
				stageMap.set(stageKey, existing)

				// By call site
				const csExisting = callSiteMap.get(callSite) ?? {
					call_site: callSite,
					stage: row.stage,
					prompt_tokens: 0,
					completion_tokens: 0,
				}
				csExisting.prompt_tokens += prompt
				csExisting.completion_tokens += completion
				callSiteMap.set(callSite, csExisting)

				// By model
				const modelKey = `${provider}/${model}`
				const mExisting = modelMap.get(modelKey) ?? {
					model,
					provider,
					prompt_tokens: 0,
					completion_tokens: 0,
					estimated_cost: 0,
				}
				mExisting.prompt_tokens += prompt
				mExisting.completion_tokens += completion
				mExisting.estimated_cost += cost
				modelMap.set(modelKey, mExisting)

				// Call site detail for recent runs
				runCallSites.push({
					call_site: callSite,
					prompt_tokens: prompt,
					completion_tokens: completion,
				})
			}

			totalPrompt += runPrompt
			totalCompletion += runCompletion

			// By date
			if (row.completed_at) {
				const dateKey = row.completed_at.toISOString().slice(0, 10)
				const dExisting = dateMap.get(dateKey) ?? {
					date: dateKey,
					ocr_tokens: 0,
					grading_tokens: 0,
					annotation_tokens: 0,
				}
				const runTotal = runPrompt + runCompletion
				if (row.stage === "ocr") dExisting.ocr_tokens += runTotal
				else if (row.stage === "grading") dExisting.grading_tokens += runTotal
				else dExisting.annotation_tokens += runTotal
				dateMap.set(dateKey, dExisting)
			}

			// By user
			if (row.user_id) {
				const uExisting = userMap.get(row.user_id) ?? {
					user_id: row.user_id,
					user_name: row.user_name ?? "Unknown",
					user_email: row.user_email ?? "",
					papers_marked: 0,
					total_tokens: 0,
					prompt_tokens: 0,
					completion_tokens: 0,
					estimated_cost: 0,
				}
				uExisting.total_tokens += runPrompt + runCompletion
				uExisting.prompt_tokens += runPrompt
				uExisting.completion_tokens += runCompletion
				uExisting.estimated_cost += estimateCost(
					runModel,
					runPrompt,
					runCompletion,
				)
				userMap.set(row.user_id, uExisting)
			}

			// Recent runs (collect all, sort and slice later)
			recentRuns.push({
				id: row.id,
				completed_at: row.completed_at?.toISOString() ?? "",
				student_name: row.student_name ?? "Unknown",
				paper_title: row.paper_title ?? "Unknown",
				stage: row.stage,
				model: runModel,
				total_calls: runCalls,
				prompt_tokens: runPrompt,
				completion_tokens: runCompletion,
				call_sites: runCallSites,
			})
		}

		// Count papers per user from grading runs
		const userPaperSets = new Map<string, Set<string>>()
		for (const row of gradingRows) {
			const userId = row.submission.uploader?.id
			if (userId) {
				const papers = userPaperSets.get(userId) ?? new Set()
				papers.add(row.submission_id)
				userPaperSets.set(userId, papers)
			}
		}
		for (const [userId, papers] of userPaperSets) {
			const u = userMap.get(userId)
			if (u) u.papers_marked = papers.size
		}

		const papersMarked = gradingSubmissions.size

		const summary: UsageSummary = {
			total_tokens: totalPrompt + totalCompletion,
			total_prompt_tokens: totalPrompt,
			total_completion_tokens: totalCompletion,
			estimated_cost: totalCost,
			papers_marked: papersMarked,
			avg_tokens_per_paper:
				papersMarked > 0
					? Math.round((totalPrompt + totalCompletion) / papersMarked)
					: 0,
		}

		// Sort recent runs by date desc, take 20
		recentRuns.sort((a, b) => b.completed_at.localeCompare(a.completed_at))
		const topRuns = recentRuns.slice(0, 20)

		// Sort call sites by total tokens desc
		const byCallSite = Array.from(callSiteMap.values()).sort(
			(a, b) =>
				b.prompt_tokens +
				b.completion_tokens -
				(a.prompt_tokens + a.completion_tokens),
		)

		// Sort dates chronologically
		const byDate = Array.from(dateMap.values()).sort((a, b) =>
			a.date.localeCompare(b.date),
		)

		// Sort models by cost desc
		const byModel = Array.from(modelMap.values()).sort(
			(a, b) => b.estimated_cost - a.estimated_cost,
		)

		// Sort users by tokens desc
		const byUser = Array.from(userMap.values()).sort(
			(a, b) => b.total_tokens - a.total_tokens,
		)

		return {
			summary,
			byStage: Array.from(stageMap.values()),
			byCallSite,
			byModel,
			byDate,
			byUser,
			recentRuns: topRuns,
		}
	},
)
