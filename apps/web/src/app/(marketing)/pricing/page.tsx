import type { Metadata } from "next"

import { auth } from "@/lib/auth"
import { foundersAvailable } from "@/lib/billing/founders"
import { formatPrice, priceTiers } from "@/lib/billing/plans"

import { CurrencySwitcher } from "../_components/currency-switcher"
import { PricingTiers } from "../_components/pricing-tiers"
import { getCurrency } from "../_lib/currency"

export const metadata: Metadata = {
	title: "Pricing — DeepMark",
	description:
		"DeepMark Pro — examiner-quality marking for GCSE teachers. Monthly or annual, 10% off when you pay yearly.",
}

export default async function PricingPage() {
	const [currency, foundersOpen, session] = await Promise.all([
		getCurrency(),
		foundersAvailable(),
		auth(),
	])
	const tiers = priceTiers(currency)
	const annualSavings = Math.round(
		100 - (tiers.annual.amount / (tiers.monthly.amount * 12)) * 100,
	)

	const monthlyHalf = Math.round(tiers.monthly.amount / 2)
	const annualHalf = Math.round(tiers.annual.amount / 2)
	const perMonthEquivalent = `${formatPrice(
		Math.round(tiers.annual.amount / 12),
		currency,
	)}/mo`
	const foundersPerMonthEquivalent = `${formatPrice(
		Math.round(annualHalf / 12),
		currency,
	)}/mo`

	return (
		<div className="mx-auto max-w-3xl px-6 py-20">
			<div className="text-center">
				<h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
					One plan. All the marking.
				</h1>
				<p className="mt-4 text-base text-muted-foreground sm:text-lg">
					Start with 20 papers free. Subscribe when you're ready.
				</p>
				<div className="mt-6 flex justify-center">
					<CurrencySwitcher current={currency} />
				</div>
			</div>
			<div className="mt-12">
				<PricingTiers
					currency={currency}
					monthly={{
						amount: tiers.monthly.amount,
						label: formatPrice(tiers.monthly.amount, currency),
						foundersLabel: foundersOpen
							? formatPrice(monthlyHalf, currency)
							: null,
					}}
					annual={{
						amount: tiers.annual.amount,
						label: formatPrice(tiers.annual.amount, currency),
						foundersLabel: foundersOpen
							? formatPrice(annualHalf, currency)
							: null,
						perMonthEquivalent,
						foundersPerMonthEquivalent: foundersOpen
							? foundersPerMonthEquivalent
							: null,
					}}
					annualSavingsPercent={annualSavings}
					foundersAvailable={foundersOpen}
					signedIn={Boolean(session)}
				/>
			</div>
			<p className="mt-8 text-center text-xs text-muted-foreground">
				Prices in {currency.toUpperCase()}. Taxes added at checkout where
				applicable.
			</p>
		</div>
	)
}
