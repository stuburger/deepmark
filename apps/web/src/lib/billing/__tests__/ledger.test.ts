import { describe, expect, it } from "vitest"

import { computePeriodExpiryAmount } from "@mcp-gcse/db"

describe("computePeriodExpiryAmount", () => {
	it("returns the unused portion when consume < grant", () => {
		expect(computePeriodExpiryAmount(60, 47)).toBe(13)
	})

	it("returns 0 when the period was fully used", () => {
		expect(computePeriodExpiryAmount(60, 60)).toBe(0)
	})

	it("returns the full grant when nothing was consumed", () => {
		expect(computePeriodExpiryAmount(60, 0)).toBe(60)
	})

	it("clamps negative values to 0 (over-consumption defensively)", () => {
		// Could happen if a backfill / admin grant temporarily inflated
		// consumes against a period beyond its grant. Period_expiry should
		// not go positive — that would credit the user for nothing.
		expect(computePeriodExpiryAmount(60, 75)).toBe(0)
	})

	it("handles zero grant (e.g. plan with no monthly grant) without negatives", () => {
		expect(computePeriodExpiryAmount(0, 0)).toBe(0)
		expect(computePeriodExpiryAmount(0, 5)).toBe(0)
	})
})
