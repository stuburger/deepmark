import { describe, expect, it } from "vitest"
import { isTalkToolPart, pickToolRenderer } from "../message-bubble"
import type { TalkToolPart } from "../tool-call-pill"

describe("isTalkToolPart", () => {
	it("accepts static tool parts (tool-* prefix)", () => {
		expect(isTalkToolPart({ type: "tool-addAnnotation" })).toBe(true)
		expect(isTalkToolPart({ type: "tool-proposeTeacherOverride" })).toBe(true)
		expect(isTalkToolPart({ type: "tool-anythingElse" })).toBe(true)
	})

	it("accepts the dynamic-tool variant", () => {
		expect(isTalkToolPart({ type: "dynamic-tool" })).toBe(true)
	})

	it("rejects non-tool parts", () => {
		expect(isTalkToolPart({ type: "text" })).toBe(false)
		expect(isTalkToolPart({ type: "reasoning" })).toBe(false)
		expect(isTalkToolPart({ type: "step-start" })).toBe(false)
		expect(isTalkToolPart({ type: "data-custom" })).toBe(false)
	})
})

describe("pickToolRenderer", () => {
	it("routes proposeTeacherOverride to the override card", () => {
		const part = {
			type: "tool-proposeTeacherOverride",
		} as unknown as TalkToolPart
		expect(pickToolRenderer(part)).toBe("override")
	})

	it("routes all other static tools to the pill", () => {
		for (const tool of [
			"tool-addAnnotation",
			"tool-updateAnnotation",
			"tool-removeAnnotation",
			"tool-linkToScan",
		]) {
			const part = { type: tool } as unknown as TalkToolPart
			expect(pickToolRenderer(part)).toBe("pill")
		}
	})

	it("routes dynamic-tool parts to the pill", () => {
		const part = { type: "dynamic-tool" } as unknown as TalkToolPart
		expect(pickToolRenderer(part)).toBe("pill")
	})
})
