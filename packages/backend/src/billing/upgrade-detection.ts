import { Plan } from "@mcp-gcse/db"

/**
 * "Welcome to Pro" / "Welcome to Unlimited" emails fire only on the first
 * transition into a paying plan. Monthly Pro renewals must NOT re-trigger
 * the email — the user already knows they're on Pro.
 *
 * Pure — takes the previous and new plan, returns the welcome event we
 * should fire (or null when no email is warranted). Tested with a table.
 */
export type WelcomeUpgrade = "pro_monthly" | "unlimited_monthly"

export function detectWelcomeUpgrade(
	previousPlan: Plan | null,
	newPlan: Plan | null,
): WelcomeUpgrade | null {
	if (newPlan === previousPlan) return null
	if (newPlan === Plan.pro_monthly) return "pro_monthly"
	if (newPlan === Plan.unlimited_monthly) return "unlimited_monthly"
	return null
}
