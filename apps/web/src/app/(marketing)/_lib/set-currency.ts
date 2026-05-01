"use server"

import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import { z } from "zod"

import { publicAction } from "@/lib/authz"

const setCurrencyInput = z.object({
	currency: z.enum(["gbp", "usd"]),
})

/**
 * Persist the user's currency choice (overrides the IP-based default the
 * middleware sets on first visit). Revalidates /pricing so the next render
 * picks up the new tier — the page reads the cookie server-side.
 */
export const setCurrency = publicAction
	.inputSchema(setCurrencyInput)
	.action(async ({ parsedInput: { currency } }) => {
		const store = await cookies()
		store.set({
			name: "dm-currency",
			value: currency,
			path: "/",
			maxAge: 60 * 60 * 24 * 365,
			sameSite: "lax",
		})
		revalidatePath("/pricing")
		return { ok: true as const }
	})
