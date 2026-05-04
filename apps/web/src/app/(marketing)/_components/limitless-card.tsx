"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
}: {
	currency: Currency
	priceLabel: string
}) {
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
						disabled
						aria-label={`Limitless at ${priceLabel} per month — available soon`}
					>
						Available soon
					</Button>
					<p className="text-center text-xs text-muted-foreground">
						{currency === "gbp" ? "Prices in GBP" : "Prices in USD"} · launching
						alongside Pro
					</p>
				</CardContent>
			</Card>
		</div>
	)
}
