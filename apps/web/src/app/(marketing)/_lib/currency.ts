import { cookies } from "next/headers"

import type { Currency } from "@/lib/billing/types"

/**
 * Resolve the currency to render on a marketing page. Reads `dm-currency`
 * (set by middleware on first visit). Defaults to USD if missing or invalid.
 */
export async function getCurrency(): Promise<Currency> {
	const store = await cookies()
	const value = store.get("dm-currency")?.value
	return value === "gbp" ? "gbp" : "usd"
}
