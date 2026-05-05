"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { createCheckoutSession } from "@/lib/billing/checkout"
import { surfaceMarkingError } from "@/lib/billing/error-toast"
import type { Currency } from "@/lib/billing/types"
import { Check } from "lucide-react"

const FEATURES = [
	"Unlimited papers — no monthly cap",
	"Priority queue during exam season",
	"All Pro features included",
	"Best fit for HoDs, exam-prep specialists, and heavy markers",
]

export function UnlimitedCard({
	currency,
	priceLabel,
	signedIn,
}: {
	currency: Currency
	priceLabel: string
	signedIn: boolean
}) {
	const [submitting, setSubmitting] = useState(false)

	async function startCheckout() {
		if (!signedIn) {
			window.location.assign(
				`/login?next=${encodeURIComponent("/pricing?tier=unlimited")}`,
			)
			return
		}
		setSubmitting(true)
		const result = await createCheckoutSession({
			kind: "unlimited",
			currency,
			interval: "monthly",
		})
		if (result?.serverError) {
			surfaceMarkingError(result.serverError)
			setSubmitting(false)
			return
		}
		const url = result?.data?.url
		if (!url) {
			surfaceMarkingError("Could not start checkout. Please try again.")
			setSubmitting(false)
			return
		}
		window.location.assign(url)
	}

	return (
		<Card className="relative border-border/60 md:row-span-4 md:grid md:grid-rows-subgrid md:gap-6">
			<CardHeader>
				<CardTitle className="text-2xl">Unlimited</CardTitle>
				<p className="text-sm text-muted-foreground">
					No caps, no top-ups, no thinking about volume.
				</p>
			</CardHeader>
			<CardContent className="flex flex-1 flex-col space-y-6 md:row-span-3 md:grid md:grid-rows-subgrid md:gap-6 md:space-y-0">
				<div>
					<div className="flex items-baseline gap-3">
						<p className="text-5xl font-bold tracking-tight">{priceLabel}</p>
						<p className="text-sm text-muted-foreground">/ month</p>
					</div>
					<p className="mt-1 text-sm text-muted-foreground">
						Mark as much as you can scan.
					</p>
				</div>
				<ul className="space-y-2">
					{FEATURES.map((feat) => (
						<li
							key={feat}
							className="flex items-start gap-2 text-sm text-foreground/90"
						>
							<Check className="mt-0.5 size-4 shrink-0 text-foreground/70" />
							{feat}
						</li>
					))}
				</ul>
				<Button
					className="mt-auto w-full md:mt-0"
					size="lg"
					variant="outline"
					onClick={startCheckout}
					disabled={submitting}
				>
					{submitting
						? "Starting checkout…"
						: signedIn
							? "Subscribe"
							: "Sign in to subscribe"}
				</Button>
			</CardContent>
		</Card>
	)
}
