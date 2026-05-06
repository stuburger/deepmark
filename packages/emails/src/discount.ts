/**
 * Discount-agnostic representation of any active subscription discount.
 *
 * The "founders" offer is the only one we run today, but this type is
 * deliberately framework-shaped: a future "back-to-school 20% off for 3
 * months" or "MAT bulk discount" rolls in without changing email copy or
 * template props. The webhook handler maps Stripe's coupon model onto this
 * shape; the template renders the sentence.
 *
 * Lives in `@mcp-gcse/emails` so the type is a contract shared by the
 * producer (billing webhook) and the consumer (email template) — no risk of
 * type drift between packages.
 */
export type ActiveDiscount = {
	/** Discounted monthly amount in minor units (post-discount, e.g. 1440 = £14.40). */
	amountOff: number
	/** Full monthly amount in minor units (pre-discount). */
	standardAmount: number
	/** ISO 4217 currency code, lower-cased. */
	currency: string
	/**
	 * When the discount expires. `null` means it runs forever (rare — corresponds
	 * to a Stripe coupon with `duration: "forever"`).
	 */
	endsAt: Date | null
}

type FormatArgs = {
	discount: ActiveDiscount | null
	planLabel: string
	standardPriceLabel: string
}

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
	day: "numeric",
	month: "long",
	year: "numeric",
})

/**
 * Money formatter for a small set of currencies. Falls back to a manual
 * minor-unit-aware representation if the currency isn't pre-known —
 * `Intl.NumberFormat` handles every ISO code, but we use a deterministic
 * map of symbols so the email reads as expected ("£14.40" not "GBP 14.40").
 */
function formatMoney(minorUnits: number, currency: string): string {
	const major = minorUnits / 100
	const formatted = major.toLocaleString("en-GB", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	})
	const symbol = currencySymbol(currency)
	return `${symbol}${formatted}`
}

function currencySymbol(currency: string): string {
	switch (currency.toLowerCase()) {
		case "gbp":
			return "£"
		case "usd":
			return "$"
		case "eur":
			return "€"
		default:
			return `${currency.toUpperCase()} `
	}
}

/**
 * Render the price line. Pure — same input always produces the same string.
 */
export function formatDiscountSentence({
	discount,
	planLabel,
	standardPriceLabel,
}: FormatArgs): string {
	if (!discount) {
		return `You're on ${planLabel} — ${standardPriceLabel}/month, billed monthly.`
	}
	const discountedLabel = formatMoney(discount.amountOff, discount.currency)
	if (!discount.endsAt) {
		return `You're on ${planLabel} at ${discountedLabel}/month, billed monthly.`
	}
	const endsAt = dateFormatter.format(discount.endsAt)
	return `You're on ${planLabel} at ${discountedLabel}/month until ${endsAt}, then ${standardPriceLabel}/month.`
}
