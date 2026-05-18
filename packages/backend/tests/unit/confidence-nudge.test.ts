import {
	LOW_CONFIDENCE_NUDGE_THRESHOLD,
	isLowConfidence,
} from "@mcp-gcse/shared"
import { describe, expect, it } from "vitest"

describe("isLowConfidence", () => {
	it("flags values strictly below the threshold", () => {
		expect(isLowConfidence(LOW_CONFIDENCE_NUDGE_THRESHOLD - 0.01)).toBe(true)
		expect(isLowConfidence(0)).toBe(true)
		expect(isLowConfidence(0.5)).toBe(true)
	})

	it("does not flag values at or above the threshold", () => {
		expect(isLowConfidence(LOW_CONFIDENCE_NUDGE_THRESHOLD)).toBe(false)
		expect(isLowConfidence(0.99)).toBe(false)
		expect(isLowConfidence(1)).toBe(false)
	})

	it("treats null (single-image fallback path) as not low-confidence", () => {
		// Single-image uploads write confidence: 1.0 today, but if any caller
		// stores null we still don't want a phantom nudge.
		expect(isLowConfidence(null)).toBe(false)
	})
})
