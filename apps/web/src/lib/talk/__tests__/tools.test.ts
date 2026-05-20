import { describe, expect, it } from "vitest"
import { buildTalkTools, signalToMarkName } from "../tools"

describe("buildTalkTools", () => {
	it("returns undefined when submissionId is absent (general-assistant mode)", () => {
		expect(buildTalkTools(undefined)).toBeUndefined()
	})

	it("returns the registered tools when submissionId is present", () => {
		const tools = buildTalkTools("sub-1")
		expect(tools).toBeDefined()
		expect(Object.keys(tools ?? {})).toEqual([
			"addAnnotation",
			"updateAnnotation",
			"removeAnnotation",
			"proposeTeacherOverride",
			"linkToScan",
		])
	})

	it("accepts addAnnotation with a phrase", () => {
		const tools = buildTalkTools("sub-1")
		const schema = tools?.addAnnotation?.inputSchema as
			| { safeParse: (input: unknown) => { success: boolean } }
			| undefined

		expect(
			schema?.safeParse({
				questionId: "q-1",
				phrase: "because of climate change",
				signal: "tick",
				reason: "Good use of evidence.",
			}).success,
		).toBe(true)
	})

	it("rejects addAnnotation without a phrase", () => {
		const tools = buildTalkTools("sub-1")
		const schema = tools?.addAnnotation?.inputSchema as
			| { safeParse: (input: unknown) => { success: boolean } }
			| undefined

		expect(
			schema?.safeParse({
				questionId: "q-1",
				signal: "tick",
				reason: "x",
			}).success,
		).toBe(false)
	})

	it("rejects addAnnotation with invalid signal or missing reason", () => {
		const tools = buildTalkTools("sub-1")
		const schema = tools?.addAnnotation?.inputSchema as
			| { safeParse: (input: unknown) => { success: boolean } }
			| undefined

		// Invalid signal → reject.
		expect(
			schema?.safeParse({
				questionId: "q-1",
				phrase: "x",
				signal: "highlight",
				reason: "y",
			}).success,
		).toBe(false)

		// Missing reason → reject (reason is required on the annotation payload).
		expect(
			schema?.safeParse({
				questionId: "q-1",
				phrase: "x",
				signal: "tick",
			}).success,
		).toBe(false)
	})

	it("validates proposeTeacherOverride input", () => {
		const tools = buildTalkTools("sub-1")
		const schema = tools?.proposeTeacherOverride?.inputSchema as
			| { safeParse: (input: unknown) => { success: boolean } }
			| undefined

		expect(
			schema?.safeParse({
				questionId: "q-1",
				suggestedScore: 8,
				reason: "Sustained analysis throughout.",
			}).success,
		).toBe(true)

		expect(
			schema?.safeParse({
				questionId: "q-1",
				suggestedScore: -1,
				reason: "x",
			}).success,
		).toBe(false)

		expect(
			schema?.safeParse({
				questionId: "q-1",
				suggestedScore: 8,
				reason: "",
			}).success,
		).toBe(false)
	})
})

describe("signalToMarkName", () => {
	it("maps API signal names to TipTap mark names", () => {
		expect(signalToMarkName("tick")).toBe("tick")
		expect(signalToMarkName("cross")).toBe("cross")
		expect(signalToMarkName("underline")).toBe("annotationUnderline")
		expect(signalToMarkName("double_underline")).toBe("doubleUnderline")
		expect(signalToMarkName("box")).toBe("box")
		expect(signalToMarkName("circle")).toBe("circle")
	})
})
