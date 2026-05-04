import type { Plan } from "@mcp-gcse/db"

/** Currencies we currently price in. ZAR / AUD added later. */
export type Currency = "gbp" | "usd"

/** Billing cadence selectable at checkout. */
export type Interval = "monthly" | "annual"

/**
 * The two recurring tiers a customer can pick at checkout. Pro has both
 * monthly + annual; Limitless is monthly-only (we don't surface annual).
 */
export type PlanKind = "pro" | "limitless"

/**
 * Plan IDs we set in Stripe Checkout `subscription_data.metadata.plan` so the
 * webhook can identify which plan was purchased without re-resolving the
 * Price. NOT the same as the Prisma `Plan` enum on User — `pro_annual` is a
 * billing cadence that maps to the same `Plan.pro_monthly` entitlement on
 * the User row. The metadata→enum translation lives in
 * `packages/backend/src/billing/webhook-translation.ts#toPersistedPlan`.
 */
export type PlanId = "pro_monthly" | "pro_annual" | "limitless_monthly"

export const TRIAL_PAPER_CAP = 20

/**
 * Sentinel prefix used by handleServerError to mark insufficient-balance
 * errors en route to the client. The toast helper (`surfaceMarkingError`)
 * checks for this prefix, strips it, and renders a toast with an Upgrade
 * action button. Both producer and consumer import from here so they can
 * never drift.
 */
export const BALANCE_ERROR_PREFIX = "[insufficient-balance] "

/**
 * Thrown when a marking action would exceed the user's available paper
 * balance. Carries plan-aware context so the UI can render the right upgrade
 * copy: trial → buy/subscribe; capped Pro → top up / Limitless;
 * PPU-only → buy another set.
 *
 * `handleServerError` maps this to a `serverError` string with the
 * `BALANCE_ERROR_PREFIX` sentinel; the client toast helper strips the prefix
 * and renders an Upgrade button.
 */
export class InsufficientBalanceError extends Error {
	constructor(
		public readonly balance: number,
		public readonly requested: number,
		public readonly plan: Plan | null,
		message?: string,
	) {
		super(
			message ?? defaultInsufficientBalanceMessage(balance, requested, plan),
		)
		this.name = "InsufficientBalanceError"
	}
}

function defaultInsufficientBalanceMessage(
	balance: number,
	requested: number,
	plan: Plan | null,
): string {
	const short = requested - balance
	if (plan === "pro_monthly") {
		return `Monthly limit hit — top up for £6.50 (15 papers) or upgrade to Limitless. Need ${short} more.`
	}
	if (plan === null && balance === 0) {
		return "Trial complete — buy a set or subscribe to keep marking."
	}
	if (plan === null) {
		return `Out of papers — buy a set (£10 / 30 papers) or subscribe. Need ${short} more.`
	}
	// limitless_monthly should never hit this branch (it resolves to
	// "uncapped" in entitlement). Defensive default.
	return `Insufficient balance: ${balance} of ${requested} required. Need ${short} more.`
}
