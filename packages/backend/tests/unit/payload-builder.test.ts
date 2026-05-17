import { describe, expect, it } from "vitest"
import type { AnnotationPlanItem } from "../../src/lib/annotations/annotation-schema"
import { buildOverlay } from "../../src/lib/annotations/payload-builder"

function item(overrides: Partial<AnnotationPlanItem>): AnnotationPlanItem {
	return {
		anchor_start: 0,
		anchor_end: 0,
		sentiment: "neutral",
		...overrides,
	} as AnnotationPlanItem
}

describe("buildOverlay — signal annotations", () => {
	it("builds a signal overlay when signal AND reason are present", () => {
		const overlay = buildOverlay(
			item({ signal: "tick", reason: "correct application" }),
		)
		expect(overlay).not.toBeNull()
		expect(overlay?.overlayType).toBe("annotation")
		if (overlay?.overlayType === "annotation") {
			expect(overlay.payload.signal).toBe("tick")
			expect(overlay.payload.reason).toBe("correct application")
		}
	})

	it("attaches AO metadata when ao_category is set", () => {
		const overlay = buildOverlay(
			item({
				signal: "double_underline",
				reason: "developed reasoning",
				ao_category: "AO5",
				ao_quality: "strong",
			}),
		)
		expect(overlay?.overlayType).toBe("annotation")
		if (overlay?.overlayType === "annotation") {
			expect(overlay.payload.ao_category).toBe("AO5")
			expect(overlay.payload.ao_display).toBe("AO5")
			expect(overlay.payload.ao_quality).toBe("strong")
		}
	})

	it("defaults ao_quality to 'valid' when ao_category set but quality missing", () => {
		const overlay = buildOverlay(
			item({
				signal: "tick",
				reason: "valid point",
				ao_category: "AO1",
			}),
		)
		expect(overlay?.overlayType).toBe("annotation")
		if (overlay?.overlayType === "annotation") {
			expect(overlay.payload.ao_quality).toBe("valid")
		}
	})
})

describe("buildOverlay — degenerate items (the Q4 empty-chain bug)", () => {
	// Pre-2026-05-17, when both signal and chain fields were absent, the
	// builder fell through to "must be chain" and emitted an empty-chain
	// placeholder. Chains have since been removed; the only valid shape is
	// signal + reason. Anything else is dropped.

	it("returns null when neither signal nor reason are set", () => {
		const overlay = buildOverlay(item({}))
		expect(overlay).toBeNull()
	})

	it("returns null when signal is set but reason is missing", () => {
		// A tick with no reason is information-free — drop it rather than
		// persist a meaningless mark on the script.
		const overlay = buildOverlay(item({ signal: "tick" }))
		expect(overlay).toBeNull()
	})

	it("returns null when reason is set but signal is missing", () => {
		// A reason with no signal has nowhere to render.
		const overlay = buildOverlay(item({ reason: "good point" }))
		expect(overlay).toBeNull()
	})
})
