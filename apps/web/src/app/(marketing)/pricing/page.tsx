import type { Metadata } from "next"
import { Resource } from "sst"

import { auth } from "@/lib/auth"
import { foundersAvailable } from "@/lib/billing/founders"
import { formatPrice, priceTiers } from "@/lib/billing/plans"

import { getCurrency } from "@/lib/billing/currency"
import { CurrencySwitcher } from "../_components/currency-switcher"
import { LimitlessCard } from "../_components/limitless-card"
import { PpuCard } from "../_components/ppu-card"
import { ProCard } from "../_components/pro-card"

export const metadata: Metadata = {
	title: "Pricing — DeepMark",
	description:
		"Examiner-quality GCSE marking. Pay-as-you-go for occasional mocks, monthly Pro for the marking pile that never empties, or Limitless for no caps.",
}

export default async function PricingPage() {
	const [currency, foundersOpen, session] = await Promise.all([
		getCurrency(),
		foundersAvailable(),
		auth(),
	])
	const tiers = priceTiers(currency)

	// All amounts read from infra/billing.ts via the StripeConfig Linkable
	// (single source of truth — same numbers Stripe charges). Founders price
	// is computed from the standard Pro price + the discount %; £24 × 0.6 =
	// £14.40, marketed as £14.50 (10p rounding drift is acceptable).
	const standardLabel = formatPrice(tiers.monthly.amount, currency)
	const foundersFactor =
		(100 - Resource.StripeConfig.foundersDiscountPercent) / 100
	const foundersAmount = Math.round(tiers.monthly.amount * foundersFactor)
	const foundersLabel = foundersOpen
		? formatPrice(foundersAmount, currency)
		: null

	const ppuPriceLabel = formatPrice(
		Resource.StripeConfig.ppu[currency].amount,
		currency,
	)
	const limitlessPriceLabel = formatPrice(
		Resource.StripeConfig.plans.limitless.prices[currency].monthly.amount,
		currency,
	)

	return (
		<div className="mx-auto max-w-6xl px-6 py-20">
			<div className="text-center">
				<h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
					Pay how you mark.
				</h1>
				<p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground sm:text-lg">
					Examiner-quality GCSE marking, three ways: a single set when you need
					it, monthly Pro for regular marking, or Limitless when caps just get
					in the way. Start with 20 papers free, no card needed.
				</p>
				<div className="mt-6 flex justify-center">
					<CurrencySwitcher current={currency} />
				</div>
			</div>

			<div className="mt-14 grid gap-6 md:grid-cols-3">
				<PpuCard
					currency={currency}
					priceLabel={ppuPriceLabel}
					signedIn={Boolean(session)}
				/>
				<ProCard
					currency={currency}
					standardLabel={standardLabel}
					foundersLabel={foundersLabel}
					foundersAvailable={foundersOpen}
					signedIn={Boolean(session)}
				/>
				<LimitlessCard
					currency={currency}
					priceLabel={limitlessPriceLabel}
					signedIn={Boolean(session)}
				/>
			</div>

			<div className="mx-auto mt-16 max-w-3xl space-y-8 text-sm text-muted-foreground">
				<div>
					<h2 className="text-base font-medium text-foreground">
						Which one is right?
					</h2>
					<p className="mt-2">
						Pay-per-set is for the HoD running occasional mocks, the cover
						supervisor, or anyone trying DeepMark on a real workload before
						committing. Pro is for the teacher whose half-term runs on this — 60
						papers a month covers two full classes, with top-ups available at
						£6.50 if exam season pushes you over. Limitless removes the cap
						entirely and is built for heavy markers and exam-prep specialists.
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
						About the founders' offer
					</h2>
					<p className="mt-2">
						The first 100 Pro subscribers pay £14.50/mo for the first 6 months,
						then £24/mo thereafter. Your feedback shapes the product during the
						lock-in period.
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
