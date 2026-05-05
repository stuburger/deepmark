"use client"

import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { createBillingPortalSession } from "@/lib/billing/portal"

export function ManageSubscriptionButton() {
	const [pending, setPending] = useState(false)

	async function open() {
		setPending(true)
		const result = await createBillingPortalSession()
		if (result?.serverError) {
			toast.error(result.serverError)
			setPending(false)
			return
		}
		const url = result?.data?.url
		if (!url) {
			toast.error("Could not open billing portal. Please try again.")
			setPending(false)
			return
		}
		window.location.assign(url)
	}

	return (
		<Button onClick={open} disabled={pending}>
			{pending ? "Opening…" : "Manage subscription"}
		</Button>
	)
}
