import { describe, expect, it } from "vitest"
import { deriveOverrideCardState } from "../override-tool-part"

describe("deriveOverrideCardState", () => {
	it("returns pending while the model is still streaming input", () => {
		expect(
			deriveOverrideCardState({
				partState: "input-streaming",
				errorReason: null,
			}),
		).toEqual({ kind: "pending" })
	})

	it("returns pending when input is available but the teacher hasn't decided", () => {
		expect(
			deriveOverrideCardState({
				partState: "input-available",
				errorReason: null,
			}),
		).toEqual({ kind: "pending" })
	})

	it("returns accepted when output reports accepted: true", () => {
		expect(
			deriveOverrideCardState({
				partState: "output-available",
				output: { accepted: true },
				errorReason: null,
			}),
		).toEqual({ kind: "accepted" })
	})

	it("returns dismissed when output reports accepted: false", () => {
		expect(
			deriveOverrideCardState({
				partState: "output-available",
				output: { accepted: false },
				errorReason: null,
			}),
		).toEqual({ kind: "dismissed" })
	})

	it("returns dismissed when output is available but accepted is missing", () => {
		// Defensive — shouldn't happen with our typed outputSchema, but
		// dismissed is the safe default for an ambiguous output.
		expect(
			deriveOverrideCardState({
				partState: "output-available",
				output: {},
				errorReason: null,
			}),
		).toEqual({ kind: "dismissed" })
	})

	it("returns error when errorReason is set, regardless of part state", () => {
		expect(
			deriveOverrideCardState({
				partState: "input-available",
				errorReason: "Server returned 500",
			}),
		).toEqual({ kind: "error", reason: "Server returned 500" })

		expect(
			deriveOverrideCardState({
				partState: "output-available",
				output: { accepted: true },
				errorReason: "Server returned 500",
			}),
		).toEqual({ kind: "error", reason: "Server returned 500" })
	})

	it("ignores empty-string errorReason (falsy)", () => {
		expect(
			deriveOverrideCardState({
				partState: "input-available",
				errorReason: "",
			}),
		).toEqual({ kind: "pending" })
	})
})
