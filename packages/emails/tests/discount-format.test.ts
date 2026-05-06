import { describe, expect, it } from "vitest"

import { formatDiscountSentence } from "../src/discount"

describe("formatDiscountSentence", () => {
	it("renders no-discount line", () => {
		const sentence = formatDiscountSentence({
			discount: null,
			planLabel: "Pro",
			standardPriceLabel: "£24",
		})
		expect(sentence).toBe("You're on Pro — £24/month, billed monthly.")
	})

	it("renders a time-bounded discount with the end date", () => {
		const sentence = formatDiscountSentence({
			discount: {
				amountOff: 1440,
				standardAmount: 2400,
				currency: "gbp",
				endsAt: new Date("2026-11-06T00:00:00Z"),
			},
			planLabel: "Pro",
			standardPriceLabel: "£24",
		})
		expect(sentence).toBe(
			"You're on Pro at £14.40/month until 6 November 2026, then £24/month.",
		)
	})

	it("renders a forever discount without an end date", () => {
		const sentence = formatDiscountSentence({
			discount: {
				amountOff: 1800,
				standardAmount: 2400,
				currency: "gbp",
				endsAt: null,
			},
			planLabel: "Pro",
			standardPriceLabel: "£24",
		})
		expect(sentence).toBe("You're on Pro at £18.00/month, billed monthly.")
	})

	it("formats USD with a $ prefix", () => {
		const sentence = formatDiscountSentence({
			discount: {
				amountOff: 1800,
				standardAmount: 3000,
				currency: "usd",
				endsAt: new Date("2026-11-06T00:00:00Z"),
			},
			planLabel: "Pro",
			standardPriceLabel: "$30",
		})
		expect(sentence).toContain("$18.00")
	})
})
