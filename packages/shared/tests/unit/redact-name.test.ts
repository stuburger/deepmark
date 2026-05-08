import { describe, expect, it } from "vitest"
import { redactName } from "../../src/redact-name"

describe("redactName", () => {
	it("redacts a typical first/last", () => {
		expect(redactName("Stuart Bourhill")).toBe("Stuart B")
	})

	it("preserves first-name casing, uppercases the initial", () => {
		expect(redactName("stuart bourhill")).toBe("stuart B")
		expect(redactName("STUART BOURHILL")).toBe("STUART B")
	})

	it("returns the single token unchanged when there is no surname", () => {
		expect(redactName("Stuart")).toBe("Stuart")
	})

	it("trims and collapses whitespace", () => {
		expect(redactName("  Stuart   Bourhill  ")).toBe("Stuart B")
	})

	it("uses the last token's initial for multi-part surnames", () => {
		expect(redactName("Stuart van der Berg")).toBe("Stuart B")
	})

	it("keeps hyphenated first names intact", () => {
		expect(redactName("Mary-Jane Watson")).toBe("Mary-Jane W")
	})

	it("handles apostrophes in the surname", () => {
		expect(redactName("Stuart O'Brien")).toBe("Stuart O")
	})

	it("returns null for empty / whitespace / nullish input", () => {
		expect(redactName("")).toBeNull()
		expect(redactName("   ")).toBeNull()
		expect(redactName(null)).toBeNull()
		expect(redactName(undefined)).toBeNull()
	})
})
