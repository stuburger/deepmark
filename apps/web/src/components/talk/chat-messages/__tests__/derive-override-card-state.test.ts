import { describe, expect, it } from "vitest"
import { deriveOverrideCardState } from "../override-tool-part"

describe("deriveOverrideCardState", () => {
	it("returns pending while the model is still streaming input", () => {
		expect(
			deriveOverrideCardState({
				partState: "input-streaming",
			}),
		).toEqual({ kind: "pending" })
	})

	it("returns pending when input is available but the teacher hasn't decided", () => {
		expect(
			deriveOverrideCardState({
				partState: "input-available",
			}),
		).toEqual({ kind: "pending" })
	})

	it("returns accepted when output reports accepted: true", () => {
		expect(
			deriveOverrideCardState({
				partState: "output-available",
				output: { accepted: true },
			}),
		).toEqual({ kind: "accepted" })
	})

	it("returns dismissed when output reports accepted: false (teacher dismiss)", () => {
		expect(
			deriveOverrideCardState({
				partState: "output-available",
				output: { accepted: false },
			}),
		).toEqual({ kind: "dismissed" })
	})

	it("returns dismissed when output reports accepted: false (mutation failure)", () => {
		// Mutation failures and teacher dismissals share the same visible
		// state — the toast handles the human signal, the model gets the
		// reason via the tool output. The card collapses the same way.
		expect(
			deriveOverrideCardState({
				partState: "output-available",
				output: { accepted: false },
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
			}),
		).toEqual({ kind: "dismissed" })
	})
})
