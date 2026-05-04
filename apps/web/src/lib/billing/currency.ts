import { cookies } from "next/headers"

import type { Currency } from "./types"

/**
 * Resolve the user's preferred currency for displaying prices. Reads the
 * `dm-currency` cookie (set by middleware on first visit and toggled by
 * the marketing currency switcher). Defaults to USD if missing or invalid.
 *
 * Lives in `lib/billing/` rather than under a route group because both the
 * marketing /pricing surface and the in-app /teacher/billing surface read
 * it — same cookie, same fallback.
 */
export async function getCurrency(): Promise<Currency> {
	const store = await cookies()
	const value = store.get("dm-currency")?.value
	return value === "gbp" ? "gbp" : "usd"
}
