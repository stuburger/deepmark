/**
 * @vitest-environment jsdom
 *
 * `error-toast.ts` is a "use client" module so even pure helpers from it pull
 * in `sonner` which expects a window. jsdom is the cheapest way to satisfy
 * that without standing up a full browser.
 */

import { describe, expect, it } from "vitest"

import { parseInsufficientBalanceError } from "../error-toast"
import { BALANCE_ERROR_PREFIX } from "../types"

describe("parseInsufficientBalanceError", () => {
	it("returns isInsufficientBalance: false for nullish input", () => {
		expect(parseInsufficientBalanceError(null)).toEqual({
			isInsufficientBalance: false,
		})
		expect(parseInsufficientBalanceError(undefined)).toEqual({
			isInsufficientBalance: false,
		})
	})

	it("returns isInsufficientBalance: false for messages without the sentinel", () => {
		expect(parseInsufficientBalanceError("Network error")).toEqual({
			isInsufficientBalance: false,
		})
		expect(parseInsufficientBalanceError(new Error("Failed to fetch"))).toEqual(
			{
				isInsufficientBalance: false,
			},
		)
	})

	it("strips the sentinel and returns the trimmed message for a string input", () => {
		const raw = `${BALANCE_ERROR_PREFIX}Out of papers — buy a set or subscribe.`
		expect(parseInsufficientBalanceError(raw)).toEqual({
			isInsufficientBalance: true,
			message: "Out of papers — buy a set or subscribe.",
		})
	})

	it("strips the sentinel from an Error.message", () => {
		const err = new Error(
			`${BALANCE_ERROR_PREFIX}Monthly limit hit — top up for £6.50.`,
		)
		expect(parseInsufficientBalanceError(err)).toEqual({
			isInsufficientBalance: true,
			message: "Monthly limit hit — top up for £6.50.",
		})
	})

	it("does not match a sentinel that appears mid-string", () => {
		// We only treat the sentinel as a prefix; mid-string occurrences are
		// (very unlikely) coincidence and shouldn't trigger the upgrade UX.
		const raw = `Failed: ${BALANCE_ERROR_PREFIX}something`
		expect(parseInsufficientBalanceError(raw)).toEqual({
			isInsufficientBalance: false,
		})
	})
})
