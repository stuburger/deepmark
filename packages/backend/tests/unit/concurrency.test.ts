import { describe, expect, it } from "vitest"
import { concurrencyLimit } from "../../src/lib/concurrency"

describe("concurrencyLimit", () => {
	it("returns an empty array for empty input", async () => {
		const result = await concurrencyLimit(4, [], async (x: number) => x * 2)
		expect(result).toEqual([])
	})

	it("preserves input order in the output", async () => {
		// Items intentionally finish out of order — fast items first to expose
		// any ordering bug that would surface from completion-order results.
		const delays = [50, 10, 30, 5, 20]
		const results = await concurrencyLimit(3, delays, async (ms, i) => {
			await new Promise((r) => setTimeout(r, ms))
			return { ms, i }
		})
		expect(results).toEqual([
			{ ms: 50, i: 0 },
			{ ms: 10, i: 1 },
			{ ms: 30, i: 2 },
			{ ms: 5, i: 3 },
			{ ms: 20, i: 4 },
		])
	})

	it("caps the number of in-flight tasks to the concurrency limit", async () => {
		let inFlight = 0
		let peakInFlight = 0
		const items = Array.from({ length: 20 }, (_, i) => i)

		await concurrencyLimit(4, items, async () => {
			inFlight++
			peakInFlight = Math.max(peakInFlight, inFlight)
			await new Promise((r) => setTimeout(r, 10))
			inFlight--
		})

		expect(peakInFlight).toBe(4)
	})

	it("runs serially when concurrency is 1", async () => {
		let inFlight = 0
		let peakInFlight = 0
		await concurrencyLimit(
			1,
			Array.from({ length: 5 }),
			async () => {
				inFlight++
				peakInFlight = Math.max(peakInFlight, inFlight)
				await new Promise((r) => setTimeout(r, 5))
				inFlight--
			},
		)
		expect(peakInFlight).toBe(1)
	})

	it("handles concurrency greater than item count", async () => {
		const result = await concurrencyLimit(
			100,
			[1, 2, 3],
			async (x: number) => x * 10,
		)
		expect(result).toEqual([10, 20, 30])
	})

	it("propagates the first rejection", async () => {
		await expect(
			concurrencyLimit(2, [1, 2, 3, 4], async (x: number) => {
				if (x === 2) throw new Error("boom on 2")
				return x
			}),
		).rejects.toThrow("boom on 2")
	})

	it("rejects on invalid concurrency (zero, negative, non-integer)", async () => {
		await expect(
			concurrencyLimit(0, [1, 2], async (x) => x),
		).rejects.toThrow(/concurrency/i)
		await expect(
			concurrencyLimit(-1, [1, 2], async (x) => x),
		).rejects.toThrow(/concurrency/i)
		await expect(
			concurrencyLimit(1.5, [1, 2], async (x) => x),
		).rejects.toThrow(/concurrency/i)
	})

	it("passes the index as the second argument to fn", async () => {
		const calls: Array<{ item: string; index: number }> = []
		await concurrencyLimit(2, ["a", "b", "c"], async (item, index) => {
			calls.push({ item, index })
		})
		// Order isn't guaranteed (concurrency 2), but every (item, index) pair must appear once.
		expect(calls.sort((a, b) => a.index - b.index)).toEqual([
			{ item: "a", index: 0 },
			{ item: "b", index: 1 },
			{ item: "c", index: 2 },
		])
	})
})
