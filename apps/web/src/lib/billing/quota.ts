import { Resource } from "sst"

/**
 * Trial allowance — used when seeding a `trial_grant` ledger entry on user
 * creation, and as the divisor for the trial-progress UI. Stored in
 * `infra/billing.ts` so changing it is a single deploy.
 */
export function trialPaperCap(): number {
	return Resource.StripeConfig.trialPaperCap
}
