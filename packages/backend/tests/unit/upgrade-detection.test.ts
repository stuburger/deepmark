import { Plan } from "@mcp-gcse/db"
import { describe, expect, it } from "vitest"

import { detectWelcomeUpgrade } from "../../src/billing/upgrade-detection"

describe("detectWelcomeUpgrade", () => {
	it("fires on null → pro", () => {
		expect(detectWelcomeUpgrade(null, Plan.pro_monthly)).toBe("pro_monthly")
	})

	it("fires on null → unlimited", () => {
		expect(detectWelcomeUpgrade(null, Plan.unlimited_monthly)).toBe(
			"unlimited_monthly",
		)
	})

	it("fires on pro → unlimited", () => {
		expect(detectWelcomeUpgrade(Plan.pro_monthly, Plan.unlimited_monthly)).toBe(
			"unlimited_monthly",
		)
	})

	it("does not fire on pro → pro (renewal)", () => {
		expect(detectWelcomeUpgrade(Plan.pro_monthly, Plan.pro_monthly)).toBeNull()
	})

	it("does not fire on unlimited → unlimited", () => {
		expect(
			detectWelcomeUpgrade(Plan.unlimited_monthly, Plan.unlimited_monthly),
		).toBeNull()
	})

	it("does not fire on plan removal (pro → null cancellation)", () => {
		expect(detectWelcomeUpgrade(Plan.pro_monthly, null)).toBeNull()
	})

	it("does not fire when both plans are null", () => {
		expect(detectWelcomeUpgrade(null, null)).toBeNull()
	})

	it("fires on unlimited → pro (downgrade still emits welcome-to-pro)", () => {
		// A downgrade is rare but possible: the user resubscribes on Pro after
		// cancelling Unlimited, or staff re-grade their plan. The welcome email
		// is the right courtesy in either case.
		expect(detectWelcomeUpgrade(Plan.unlimited_monthly, Plan.pro_monthly)).toBe(
			"pro_monthly",
		)
	})
})
