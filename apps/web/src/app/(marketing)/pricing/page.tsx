import type { Metadata } from "next"

import { auth } from "@/lib/auth"
import { foundersAvailable } from "@/lib/billing/founders"
import { formatPrice, priceTiers } from "@/lib/billing/plans"

import { CurrencySwitcher } from "../_components/currency-switcher"
import { PpuCard } from "../_components/ppu-card"
import { PricingTiers } from "../_components/pricing-tiers"
import { getCurrency } from "../_lib/currency"

export const metadata: Metadata = {
	title: "Pricing — DeepMark",
	description:
		"Examiner-quality GCSE marking, two ways to pay. Subscribe monthly for unlimited classes, or pay per set when you need it.",
}

// PPU price per currency, in minor units (pence/cents). Subscription pricing
// lives in `infra/billing.ts` because it backs real Stripe Prices; per-set is
// surfaced as informational copy here until the PPU Stripe wiring lands.
const PPU_AMOUNTS: Record<"gbp" | "usd", number> = {
	gbp: 1000, // £10
	usd: 1300, // $13
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

	const ppuPriceLabel = formatPrice(PPU_AMOUNTS[currency], currency)

	return (
		<div className="mx-auto max-w-5xl px-6 py-20">
			<div className="text-center">
				<h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
					Mark by the set, or by the month.
				</h1>
				<p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground sm:text-lg">
					Examiner-quality GCSE marking, priced two ways. Same engine, same
					accuracy — pick what fits how you actually work. Start with 20 papers
					free, no card needed.
				</p>
				<div className="mt-6 flex justify-center">
					<CurrencySwitcher current={currency} />
				</div>
			</div>

			<div className="mt-14 grid gap-6 md:grid-cols-2">
				<PpuCard currency={currency} priceLabel={ppuPriceLabel} />
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

			<div className="mx-auto mt-16 max-w-3xl space-y-8 text-sm text-muted-foreground">
				<div>
					<h2 className="text-base font-medium text-foreground">
						Why two prices?
					</h2>
					<p className="mt-2">
						Not every teacher marks every week. The monthly plan is for the
						teacher whose half-term runs on this — unlimited classes, founders'
						discount locked in. Pay-per-set is for the HoD running occasional
						mocks, the cover supervisor, or anyone trying DeepMark on a real
						workload before committing. Same marking either way.
					</p>
				</div>
				<div>
					<h2 className="text-base font-medium text-foreground">
						What's a "set"?
					</h2>
					<p className="mt-2">
						One question paper run against a class of student scripts, up to 30.
						One mock, one batch.
					</p>
				</div>
				<div>
					<h2 className="text-base font-medium text-foreground">
						Schools and departments
					</h2>
					<p className="mt-2">
						Bespoke pricing for departmental and MAT-level rollouts is in
						development.{" "}
						<a
							href="mailto:hello@getdeepmark.com?subject=Schools%20%26%20departments"
							className="underline underline-offset-4 hover:text-foreground"
						>
							Get in touch
						</a>{" "}
						for early access.
					</p>
				</div>
			</div>

			<p className="mt-12 text-center text-xs text-muted-foreground">
				Prices in {currency.toUpperCase()}. Taxes added at checkout where
				applicable.
			</p>
		</div>
	)
}
