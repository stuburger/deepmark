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

export function LimitlessCard({
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
				`/login?next=${encodeURIComponent("/pricing?tier=limitless")}`,
			)
			return
		}
		setSubmitting(true)
		const result = await createCheckoutSession({
			kind: "limitless",
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
		<div className="flex h-full flex-col">
			<Card className="relative flex h-full flex-col border-border/60">
				<CardHeader>
					<CardTitle className="text-2xl">Limitless</CardTitle>
					<p className="text-sm text-muted-foreground">
						No caps, no top-ups, no thinking about volume.
					</p>
				</CardHeader>
				<CardContent className="flex flex-1 flex-col space-y-6">
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
						className="mt-auto w-full"
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
					<p className="text-center text-xs text-muted-foreground">
						{currency === "gbp" ? "Prices in GBP" : "Prices in USD"}
					</p>
				</CardContent>
			</Card>
		</div>
	)
}
