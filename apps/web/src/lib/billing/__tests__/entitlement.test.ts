import { Plan } from "@mcp-gcse/db"
import { describe, expect, it } from "vitest"

import {
	type Entitlement,
	decideEntitlement,
	decideQuotaCheck,
	isActivelyEntitled,
} from "../entitlement-decision"

describe("decideEntitlement", () => {
	it("returns metered with zero balance when user is null", () => {
		expect(decideEntitlement({ user: null, balance: 0 })).toEqual({
			kind: "metered",
			balance: 0,
			plan: null,
		})
	})

	it("returns admin for admin role regardless of plan / balance", () => {
		expect(
			decideEntitlement({
				user: {
					role: "admin",
					plan: Plan.pro_monthly,
					subscription_status: "active",
				},
				balance: 0,
			}),
		).toEqual({ kind: "admin" })
	})

	it("returns uncapped for unlimited_monthly with active status", () => {
		expect(
			decideEntitlement({
				user: {
					role: "teacher",
					plan: Plan.unlimited_monthly,
					subscription_status: "active",
				},
				balance: 0,
			}),
		).toEqual({ kind: "uncapped", plan: Plan.unlimited_monthly })
	})

	it("returns metered for pro_monthly (capped) — needs balance check", () => {
		expect(
			decideEntitlement({
				user: {
					role: "teacher",
					plan: Plan.pro_monthly,
					subscription_status: "active",
				},
				balance: 47,
			}),
		).toEqual({ kind: "metered", balance: 47, plan: Plan.pro_monthly })
	})

	it("returns metered with plan=null when subscription is past_due (lapsed sub)", () => {
		expect(
			decideEntitlement({
				user: {
					role: "teacher",
					plan: Plan.unlimited_monthly,
					subscription_status: "past_due",
				},
				balance: 0,
			}),
		).toEqual({ kind: "metered", balance: 0, plan: null })
	})

	it("returns metered for users with no plan (trial / PPU-only)", () => {
		expect(
			decideEntitlement({
				user: {
					role: "teacher",
					plan: null,
					subscription_status: null,
				},
				balance: 12,
			}),
		).toEqual({ kind: "metered", balance: 12, plan: null })
	})

	it("treats canceled subscription as non-active (drops to metered)", () => {
		expect(
			decideEntitlement({
				user: {
					role: "teacher",
					plan: Plan.pro_monthly,
					subscription_status: "canceled",
				},
				balance: 5,
			}),
		).toEqual({ kind: "metered", balance: 5, plan: null })
	})
})

describe("decideQuotaCheck", () => {
	const admin: Entitlement = { kind: "admin" }
	const uncapped: Entitlement = {
		kind: "uncapped",
		plan: Plan.unlimited_monthly,
	}

	it("admin always passes regardless of request size", () => {
		expect(
			decideQuotaCheck({ entitlement: admin, additionalPapers: 1_000_000 }),
		).toEqual({ ok: true })
	})

	it("uncapped always passes", () => {
		expect(
			decideQuotaCheck({ entitlement: uncapped, additionalPapers: 500 }),
		).toEqual({ ok: true })
	})

	it("metered passes when balance >= request", () => {
		expect(
			decideQuotaCheck({
				entitlement: { kind: "metered", balance: 30, plan: null },
				additionalPapers: 25,
			}),
		).toEqual({ ok: true })
	})

	it("metered passes at exact equality", () => {
		expect(
			decideQuotaCheck({
				entitlement: { kind: "metered", balance: 5, plan: null },
				additionalPapers: 5,
			}),
		).toEqual({ ok: true })
	})

	it("metered fails when balance < request, returning context for the error", () => {
		expect(
			decideQuotaCheck({
				entitlement: { kind: "metered", balance: 3, plan: Plan.pro_monthly },
				additionalPapers: 10,
			}),
		).toEqual({
			ok: false,
			balance: 3,
			requested: 10,
			plan: Plan.pro_monthly,
		})
	})

	it("metered fails on zero balance with non-zero request", () => {
		expect(
			decideQuotaCheck({
				entitlement: { kind: "metered", balance: 0, plan: null },
				additionalPapers: 1,
			}),
		).toEqual({ ok: false, balance: 0, requested: 1, plan: null })
	})
})

describe("isActivelyEntitled", () => {
	it("true for active pro subscription", () => {
		expect(
			isActivelyEntitled({
				role: "teacher",
				plan: Plan.pro_monthly,
				subscription_status: "active",
			}),
		).toBe(true)
	})

	it("true for trialing status", () => {
		expect(
			isActivelyEntitled({
				role: "teacher",
				plan: Plan.unlimited_monthly,
				subscription_status: "trialing",
			}),
		).toBe(true)
	})

	it("false when no plan", () => {
		expect(
			isActivelyEntitled({
				role: "teacher",
				plan: null,
				subscription_status: "active",
			}),
		).toBe(false)
	})

	it("false for past_due / canceled / paused", () => {
		for (const status of ["past_due", "canceled", "paused", "incomplete"]) {
			expect(
				isActivelyEntitled({
					role: "teacher",
					plan: Plan.pro_monthly,
					subscription_status: status,
				}),
			).toBe(false)
		}
	})
})
