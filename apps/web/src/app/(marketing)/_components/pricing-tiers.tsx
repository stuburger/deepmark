"use client"

import { useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { createCheckoutSession } from "@/lib/billing/checkout"
import { surfaceMarkingError } from "@/lib/billing/error-toast"
import type { Currency } from "@/lib/billing/types"
import { Check } from "lucide-react"

type IntervalTier = {
	amount: number
	label: string
	/** Founders price (50% off) — null when founders' slots are sold out. */
	foundersLabel: string | null
}

type AnnualTier = IntervalTier & {
	perMonthEquivalent: string
	foundersPerMonthEquivalent: string | null
}

type TierData = {
	currency: Currency
	monthly: IntervalTier
	annual: AnnualTier
	annualSavingsPercent: number
	foundersAvailable: boolean
	signedIn: boolean
}

const FEATURES = [
	"Unlimited question papers, mark schemes and scripts",
	"Every GCSE specification supported",
	"Inline annotations on the original script",
	"Class analytics and per-student insights",
	"Direct line to the team — what you ask for, we build",
]

export function PricingTiers(props: TierData) {
	const [interval, setInterval] = useState<"monthly" | "annual">("monthly")
	const [submitting, setSubmitting] = useState<"monthly" | "annual" | null>(
		null,
	)

	async function startCheckout(chosen: "monthly" | "annual") {
		if (!props.signedIn) {
			window.location.assign(
				`/login?next=${encodeURIComponent(`/pricing?tier=${chosen}`)}`,
			)
			return
		}
		setSubmitting(chosen)
		const result = await createCheckoutSession({
			currency: props.currency,
			interval: chosen,
		})
		if (result?.serverError) {
			surfaceMarkingError(result.serverError)
			setSubmitting(null)
			return
		}
		const url = result?.data?.url
		if (!url) {
			surfaceMarkingError("Could not start checkout. Please try again.")
			setSubmitting(null)
			return
		}
		window.location.assign(url)
	}

	const active = interval === "monthly" ? props.monthly : props.annual
	const showFounders = props.foundersAvailable && active.foundersLabel !== null

	return (
		<div className="flex h-full flex-col">
			<div className="mb-8 flex justify-center">
				<div className="inline-flex rounded-full border border-border/60 bg-muted/40 p-1 text-sm">
					<IntervalButton
						label="Monthly"
						selected={interval === "monthly"}
						onClick={() => setInterval("monthly")}
					/>
					<IntervalButton
						label={`Annual · save ${props.annualSavingsPercent}%`}
						selected={interval === "annual"}
						onClick={() => setInterval("annual")}
					/>
				</div>
			</div>

			{/*
			  Card has overflow-hidden baked in (for image children); override here so
			  the founders' badge that floats above the top edge isn't clipped.
			*/}
			<Card className="relative flex h-full flex-col overflow-visible border-border/60">
				{props.foundersAvailable ? (
					<Badge className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap">
						Founders' pricing — 50% off year one
					</Badge>
				) : null}
				<CardHeader>
					<CardTitle className="text-2xl">Monthly</CardTitle>
					<p className="text-sm text-muted-foreground">
						For the teacher whose marking pile never empties.
					</p>
				</CardHeader>
				<CardContent className="flex flex-1 flex-col space-y-6">
					<div>
						<div className="flex items-baseline gap-3">
							{showFounders ? (
								<>
									<p className="text-5xl font-bold tracking-tight">
										{active.foundersLabel}
									</p>
									<p className="text-2xl font-medium text-muted-foreground line-through">
										{active.label}
									</p>
								</>
							) : (
								<p className="text-5xl font-bold tracking-tight">
									{active.label}
								</p>
							)}
						</div>
						<p className="mt-1 text-sm text-muted-foreground">
							{interval === "annual" ? (
								<>
									{showFounders && props.annual.foundersPerMonthEquivalent
										? props.annual.foundersPerMonthEquivalent
										: props.annual.perMonthEquivalent}{" "}
									billed annually
									{showFounders ? " for year one" : ""}
								</>
							) : (
								<>per month{showFounders ? " for year one" : ""}</>
							)}
						</p>
						{showFounders ? (
							<p className="mt-1 text-xs text-muted-foreground">
								Then {active.label}
								{interval === "monthly" ? "/mo" : "/yr"} after.
							</p>
						) : null}
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
						onClick={() => startCheckout(interval)}
						disabled={submitting !== null}
					>
						{submitting === interval
							? "Starting checkout…"
							: props.signedIn
								? "Subscribe"
								: "Sign in to subscribe"}
					</Button>
				</CardContent>
			</Card>
		</div>
	)
}

function IntervalButton({
	label,
	selected,
	onClick,
}: {
	label: string
	selected: boolean
	onClick: () => void
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
				selected
					? "bg-foreground text-background"
					: "text-muted-foreground hover:text-foreground"
			}`}
		>
			{label}
		</button>
	)
}
