import { Plan } from "@mcp-gcse/db"
import type Stripe from "stripe"
import { describe, expect, it } from "vitest"

import {
	decideCheckoutSessionAction,
	extractCustomerId,
	identifyUserCriteria,
	invoiceOutcomeToStatus,
	subscriptionToUserUpdate,
	toPersistedPlan,
} from "../../src/billing/webhook-translation"

// Minimal builder so each test states only the fields it cares about. Casts
// to the SDK types are intentional — we're testing the translator's contract,
// not the SDK shape.
function buildSubscription(
	overrides: Partial<Stripe.Subscription> & {
		customer?: Stripe.Subscription["customer"]
		metadata?: Record<string, string>
		items?: Partial<Stripe.Subscription["items"]>
	} = {},
): Stripe.Subscription {
	const baseItem = {
		current_period_end: 1_900_000_000, // ~2030
	} as Stripe.SubscriptionItem
	return {
		id: "sub_test",
		object: "subscription",
		status: "active",
		customer: "cus_test",
		metadata: {},
		items: { object: "list", data: [baseItem], has_more: false, url: "" },
		...overrides,
	} as Stripe.Subscription
}

describe("extractCustomerId", () => {
	it("returns the string id when customer is a string", () => {
		expect(extractCustomerId("cus_123")).toBe("cus_123")
	})

	it("returns the .id when customer is an expanded object", () => {
		expect(extractCustomerId({ id: "cus_456" } as Stripe.Customer)).toBe(
			"cus_456",
		)
	})

	it("returns the .id from a DeletedCustomer", () => {
		expect(
			extractCustomerId({
				id: "cus_789",
				deleted: true,
			} as Stripe.DeletedCustomer),
		).toBe("cus_789")
	})

	it("returns null for null/undefined", () => {
		expect(extractCustomerId(null)).toBeNull()
		expect(extractCustomerId(undefined)).toBeNull()
	})
})

describe("subscriptionToUserUpdate", () => {
	it("translates a typical active subscription", () => {
		const sub = buildSubscription({
			id: "sub_abc",
			status: "active",
			customer: "cus_123",
			metadata: { plan: "pro_monthly", user_id: "user_xyz" },
		})
		const update = subscriptionToUserUpdate(sub)
		expect(update).toEqual({
			stripe_customer_id: "cus_123",
			stripe_subscription_id: "sub_abc",
			subscription_status: "active",
			plan: Plan.pro_monthly,
			current_period_end: new Date(1_900_000_000 * 1000),
		})
	})

	it("extracts the customer id from an expanded customer object", () => {
		const sub = buildSubscription({
			customer: { id: "cus_obj" } as Stripe.Customer,
		})
		expect(subscriptionToUserUpdate(sub).stripe_customer_id).toBe("cus_obj")
	})

	it("reads current_period_end from items[0] (new API location)", () => {
		const sub = buildSubscription({
			items: {
				object: "list",
				data: [
					{ current_period_end: 1_700_000_000 } as Stripe.SubscriptionItem,
				],
				has_more: false,
				url: "",
			},
		})
		expect(subscriptionToUserUpdate(sub).current_period_end).toEqual(
			new Date(1_700_000_000 * 1000),
		)
	})

	it("returns null current_period_end when items is empty", () => {
		const sub = buildSubscription({
			items: { object: "list", data: [], has_more: false, url: "" },
		})
		expect(subscriptionToUserUpdate(sub).current_period_end).toBeNull()
	})

	it("returns plan: null when metadata.plan is missing", () => {
		const sub = buildSubscription({ metadata: { user_id: "user_xyz" } })
		expect(subscriptionToUserUpdate(sub).plan).toBeNull()
	})

	it("preserves the verbatim subscription_status value", () => {
		for (const status of [
			"active",
			"trialing",
			"past_due",
			"canceled",
			"incomplete",
			"incomplete_expired",
			"unpaid",
			"paused",
		] as const) {
			const sub = buildSubscription({ status })
			expect(subscriptionToUserUpdate(sub).subscription_status).toBe(status)
		}
	})

	it("throws when the subscription has no resolvable customer id", () => {
		const sub = buildSubscription({
			customer: null as unknown as Stripe.Subscription["customer"],
		})
		expect(() => subscriptionToUserUpdate(sub)).toThrow(
			/no resolvable customer/,
		)
	})
})

describe("identifyUserCriteria", () => {
	it("prefers metadata.user_id when present", () => {
		const sub = buildSubscription({
			customer: "cus_111",
			metadata: { user_id: "user_xyz" },
		})
		expect(identifyUserCriteria(sub)).toEqual({
			kind: "byId",
			userId: "user_xyz",
		})
	})

	it("falls back to stripe_customer_id when metadata.user_id is absent", () => {
		const sub = buildSubscription({ customer: "cus_222", metadata: {} })
		expect(identifyUserCriteria(sub)).toEqual({
			kind: "byCustomer",
			stripeCustomerId: "cus_222",
		})
	})

	it("returns null when neither metadata nor customer id is available", () => {
		const sub = buildSubscription({
			customer: null as unknown as Stripe.Subscription["customer"],
			metadata: {},
		})
		expect(identifyUserCriteria(sub)).toBeNull()
	})
})

describe("invoiceOutcomeToStatus", () => {
	it("maps succeeded → active", () => {
		expect(invoiceOutcomeToStatus("succeeded")).toBe("active")
	})

	it("maps failed → past_due", () => {
		expect(invoiceOutcomeToStatus("failed")).toBe("past_due")
	})
})

describe("toPersistedPlan", () => {
	it("maps pro_monthly checkout marker to Plan.pro_monthly", () => {
		expect(toPersistedPlan("pro_monthly")).toBe(Plan.pro_monthly)
	})

	it("collapses pro_annual onto Plan.pro_monthly (same entitlement, different cadence)", () => {
		expect(toPersistedPlan("pro_annual")).toBe(Plan.pro_monthly)
	})

	it("maps unlimited_monthly to Plan.unlimited_monthly", () => {
		expect(toPersistedPlan("unlimited_monthly")).toBe(Plan.unlimited_monthly)
	})

	it("returns null for unknown / missing plan markers", () => {
		expect(toPersistedPlan(null)).toBeNull()
		expect(toPersistedPlan(undefined)).toBeNull()
		expect(toPersistedPlan("")).toBeNull()
		expect(toPersistedPlan("free")).toBeNull()
	})
})

function buildSession(
	overrides: Partial<Stripe.Checkout.Session> = {},
): Stripe.Checkout.Session {
	return {
		id: "cs_test",
		object: "checkout.session",
		mode: "payment",
		metadata: {},
		...overrides,
	} as Stripe.Checkout.Session
}

describe("decideCheckoutSessionAction", () => {
	it("ignores subscription-mode sessions (subscription.* drives that path)", () => {
		const result = decideCheckoutSessionAction(
			buildSession({ mode: "subscription" }),
		)
		expect(result).toEqual({ kind: "ignore", reason: "mode=subscription" })
	})

	it("ignores setup-mode sessions", () => {
		const result = decideCheckoutSessionAction(buildSession({ mode: "setup" }))
		expect(result).toEqual({ kind: "ignore", reason: "mode=setup" })
	})

	it("ignores payment-mode sessions missing user_id", () => {
		const result = decideCheckoutSessionAction(
			buildSession({ mode: "payment", metadata: { kind: "ppu" } }),
		)
		expect(result.kind).toBe("ignore")
	})

	it("recognises a PPU purchase session", () => {
		const result = decideCheckoutSessionAction(
			buildSession({
				mode: "payment",
				metadata: { kind: "ppu", user_id: "u_123" },
			}),
		)
		expect(result).toEqual({
			kind: "ppu_purchase",
			userId: "u_123",
			sessionId: "cs_test",
		})
	})

	it("recognises a top-up purchase session", () => {
		const result = decideCheckoutSessionAction(
			buildSession({
				mode: "payment",
				metadata: { kind: "topup", user_id: "u_456" },
			}),
		)
		expect(result).toEqual({
			kind: "topup_purchase",
			userId: "u_456",
			sessionId: "cs_test",
		})
	})

	it("ignores payment-mode sessions with unknown metadata.kind", () => {
		const result = decideCheckoutSessionAction(
			buildSession({
				mode: "payment",
				metadata: { kind: "unrecognised", user_id: "u_1" },
			}),
		)
		expect(result.kind).toBe("ignore")
	})
})
