"use client"

import { useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { createCheckoutSession } from "@/lib/billing/checkout"
import { surfaceMarkingError } from "@/lib/billing/error-toast"
import type { Currency } from "@/lib/billing/types"
import { Check } from "lucide-react"

type Props = {
	currency: Currency
	standardLabel: string
	/** Founders price (40% off, 6 months) — null when founders' slots are sold out. */
	foundersLabel: string | null
	foundersAvailable: boolean
	signedIn: boolean
}

const FEATURES = [
	"60 papers per month included",
	"Every GCSE specification supported",
	"Inline annotations on the original script",
	"Class analytics and per-student insights",
	"Top up at £6.50 / 15 papers if you need more",
]

export function ProCard(props: Props) {
	const [submitting, setSubmitting] = useState(false)

	async function startCheckout() {
		if (!props.signedIn) {
			window.location.assign(
				`/login?next=${encodeURIComponent("/pricing?tier=pro")}`,
			)
			return
		}
		setSubmitting(true)
		const result = await createCheckoutSession({
			currency: props.currency,
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

	const showFounders = props.foundersAvailable && props.foundersLabel !== null

	return (
		<div className="flex h-full flex-col">
			{/*
			  Card has overflow-hidden baked in (for image children); override here so
			  the founders' badge that floats above the top edge isn't clipped.
			*/}
			<Card className="relative flex h-full flex-col overflow-visible border-border/60">
				{props.foundersAvailable ? (
					<Badge className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap">
						Founders' price — 40% off, 6 months
					</Badge>
				) : null}
				<CardHeader>
					<CardTitle className="text-2xl">Pro</CardTitle>
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
										{props.foundersLabel}
									</p>
									<p className="text-2xl font-medium text-muted-foreground line-through">
										{props.standardLabel}
									</p>
								</>
							) : (
								<p className="text-5xl font-bold tracking-tight">
									{props.standardLabel}
								</p>
							)}
						</div>
						<p className="mt-1 text-sm text-muted-foreground">
							per month{showFounders ? " for 6 months" : ""}
						</p>
						{showFounders ? (
							<p className="mt-1 text-xs text-muted-foreground">
								Then {props.standardLabel}/mo from month 7.
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
						onClick={startCheckout}
						disabled={submitting}
					>
						{submitting
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
