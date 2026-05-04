"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { createPpuCheckoutSession } from "@/lib/billing/checkout-payment"
import { surfaceMarkingError } from "@/lib/billing/error-toast"
import type { Currency } from "@/lib/billing/types"
import { Check } from "lucide-react"

const FEATURES = [
	"No subscription, no recurring charge",
	"Same marking engine, same accuracy",
	"Pay only when you actually mark",
	"Upgrade to monthly any time",
]

type Props = {
	currency: Currency
	priceLabel: string
	signedIn: boolean
}

export function PpuCard(props: Props) {
	const [submitting, setSubmitting] = useState(false)

	async function startCheckout() {
		if (!props.signedIn) {
			window.location.assign(
				`/login?next=${encodeURIComponent("/pricing?tier=ppu")}`,
			)
			return
		}
		setSubmitting(true)
		const result = await createPpuCheckoutSession({
			currency: props.currency,
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
					<CardTitle className="text-2xl">Pay per set</CardTitle>
					<p className="text-sm text-muted-foreground">
						For mocks, cover lessons, or trying DeepMark on a real stack before
						subscribing.
					</p>
				</CardHeader>
				<CardContent className="flex flex-1 flex-col space-y-6">
					<div>
						<div className="flex items-baseline gap-3">
							<p className="text-5xl font-bold tracking-tight">
								{props.priceLabel}
							</p>
							<p className="text-sm text-muted-foreground">/ set</p>
						</div>
						<p className="mt-1 text-sm text-muted-foreground">
							One question paper, up to 30 student scripts.
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
							: props.signedIn
								? "Buy a set"
								: "Sign in to buy"}
					</Button>
				</CardContent>
			</Card>
		</div>
	)
}
