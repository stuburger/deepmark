"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { Currency } from "@/lib/billing/types"
import { Check } from "lucide-react"

const FEATURES = [
	"No subscription, no recurring charge",
	"Same marking engine, same accuracy",
	"Pay only when you actually mark",
	"Upgrade to monthly any time",
]

export function PpuCard({
	currency,
	priceLabel,
}: {
	currency: Currency
	priceLabel: string
}) {
	return (
		<div className="flex h-full flex-col">
			{/* Spacer matches the interval-toggle height in PricingTiers so both cards line up. */}
			<div className="mb-8 h-[34px]" aria-hidden />
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
							<p className="text-5xl font-bold tracking-tight">{priceLabel}</p>
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
						disabled
						aria-label={`Pay ${priceLabel} per set — available soon`}
					>
						Available soon
					</Button>
					<p className="text-center text-xs text-muted-foreground">
						{currency === "gbp" ? "Prices in GBP" : "Prices in USD"} · launching
						alongside subscription
					</p>
				</CardContent>
			</Card>
		</div>
	)
}
