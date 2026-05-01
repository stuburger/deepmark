/** Currencies we currently price in. ZAR / AUD added later. */
export type Currency = "gbp" | "usd"

/** Billing cadence selectable at checkout. */
export type Interval = "monthly" | "annual"

/** Plan IDs as we store them on User.plan. Trial users have plan=null. */
export type PlanId = "pro_monthly" | "pro_annual"

export const TRIAL_PAPER_CAP = 20

/**
 * Sentinel prefix used by handleServerError to mark trial-exhaustion errors
 * en route to the client. The toast helper (`surfaceMarkingError`) checks
 * for this prefix, strips it, and renders a toast with an Upgrade action
 * button. Both producer and consumer import from here so they can never
 * drift.
 */
export const TRIAL_ERROR_PREFIX = "[trial-exhausted] "

export class TrialExhaustedError extends Error {
	constructor(message = "Trial complete — upgrade to keep marking.") {
		super(message)
		this.name = "TrialExhaustedError"
	}
}
