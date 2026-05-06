import { Text } from "@react-email/components"

import { colors, radii, spacing } from "../_tokens"
import type { ActiveDiscount } from "../discount"
import { formatDiscountSentence } from "../discount"

type Props = {
	discount: ActiveDiscount | null
	planLabel: string
	standardPriceLabel: string
}

/**
 * Renders the price line for a Pro / Unlimited welcome email.
 *
 *  - No discount → "You're on Pro. £24/mo, billed monthly."
 *  - Time-bounded discount → "On Pro at £14.40/mo until 5 November 2026,
 *                             then £24/mo."
 *  - Forever discount → "On Pro at £14.40/mo, billed monthly."
 *
 * Discount-agnostic by design. The "founders" offer is just a stripe.Coupon
 * from this email's perspective.
 */
export function DiscountLine({
	discount,
	planLabel,
	standardPriceLabel,
}: Props) {
	const sentence = formatDiscountSentence({
		discount,
		planLabel,
		standardPriceLabel,
	})
	return (
		<Text
			style={{
				fontSize: "14px",
				lineHeight: "22px",
				color: colors.ink900,
				backgroundColor: colors.teal50,
				border: `1px solid ${colors.teal100}`,
				borderRadius: radii.tile,
				padding: `${spacing.sm} ${spacing.md}`,
				margin: `${spacing.md} 0`,
			}}
		>
			{sentence}
		</Text>
	)
}
