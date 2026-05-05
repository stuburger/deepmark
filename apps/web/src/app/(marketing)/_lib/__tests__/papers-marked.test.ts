import { afterEach, describe, expect, it, vi } from "vitest"

/**
 * Pin the marketing counter's nested Prisma `where` filter shape — the
 * traversal `{ answer: { submission: { superseded_at: null } } }` is
 * exactly the kind of thing that's easy to get wrong silently and ship
 * a public-facing zero or a public-facing inflated count.
 *
 * We don't need a real DB here: the question is "did we ask Prisma the
 * right question?". Mock `db.markingResult.count` + `db.studentSubmission.count`
 * to capture their args, mock `next/cache` so `unstable_cache` is a
 * pass-through, and assert the call shapes.
 */

const markingResultCount = vi.fn()
const submissionCount = vi.fn()

vi.mock("@/lib/db", () => ({
	db: {
		markingResult: { count: markingResultCount },
		studentSubmission: { count: submissionCount },
	},
}))

vi.mock("next/cache", () => ({
	unstable_cache: <T extends (...args: unknown[]) => unknown>(fn: T) => fn,
}))

afterEach(() => {
	vi.clearAllMocks()
})

describe("getMarketingStats", () => {
	it("counts marking results scoped to current (non-superseded) submissions", async () => {
		submissionCount.mockResolvedValue(159)
		markingResultCount.mockResolvedValue(2400)

		const { getMarketingStats } = await import("../papers-marked")
		const stats = await getMarketingStats()

		expect(markingResultCount).toHaveBeenCalledTimes(1)
		expect(markingResultCount).toHaveBeenCalledWith({
			where: { answer: { is: { submission: { is: { superseded_at: null } } } } },
		})
		expect(stats.personalizedComments).toBe(2400)
	})

	it("counts current submissions with a complete grading run as papersMarked", async () => {
		submissionCount.mockResolvedValue(159)
		markingResultCount.mockResolvedValue(2400)

		const { getMarketingStats } = await import("../papers-marked")
		await getMarketingStats()

		expect(submissionCount).toHaveBeenCalledWith({
			where: {
				superseded_at: null,
				grading_runs: { some: { status: "complete" } },
			},
		})
	})

	it("derives hoursSaved from comment count via the public conversion", async () => {
		submissionCount.mockResolvedValue(0)
		// 2400 answers * 45s = 108_000s = 30h
		markingResultCount.mockResolvedValue(2400)

		const { getMarketingStats } = await import("../papers-marked")
		const stats = await getMarketingStats()

		expect(stats.hoursSaved).toBe(30)
	})

	it("returns zeros cleanly when nothing has been marked yet", async () => {
		submissionCount.mockResolvedValue(0)
		markingResultCount.mockResolvedValue(0)

		const { getMarketingStats } = await import("../papers-marked")
		const stats = await getMarketingStats()

		expect(stats).toEqual({
			papersMarked: 0,
			personalizedComments: 0,
			hoursSaved: 0,
		})
	})
})
