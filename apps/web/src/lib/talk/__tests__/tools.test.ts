import { describe, expect, it } from "vitest"
import { buildTalkTools, signalToMarkName } from "../tools"

describe("buildTalkTools", () => {
	it("returns undefined when submissionId is absent (general-assistant mode)", () => {
		expect(buildTalkTools(undefined)).toBeUndefined()
	})

	it("returns the full tool set when submissionId is present", () => {
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

	it("validates addAnnotation input against the existing signal enum", () => {
		const tools = buildTalkTools("sub-1")
		const addAnnotation = tools?.addAnnotation
		// inputSchema is a Zod schema — exercise it directly.
		const schema = addAnnotation?.inputSchema as
			| { safeParse: (input: unknown) => { success: boolean } }
			| undefined

		expect(
			schema?.safeParse({
				questionId: "q-1",
				tokenStart: "tok-1",
				tokenEnd: "tok-3",
				signal: "tick",
				reason: "Good use of evidence.",
			}).success,
		).toBe(true)

		// Invalid signal → reject.
		expect(
			schema?.safeParse({
				questionId: "q-1",
				tokenStart: "tok-1",
				tokenEnd: "tok-3",
				signal: "highlight",
				reason: "",
			}).success,
		).toBe(false)

		// Missing reason → reject (reason is required on the annotation payload).
		expect(
			schema?.safeParse({
				questionId: "q-1",
				tokenStart: "tok-1",
				tokenEnd: "tok-3",
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

		// Negative scores rejected.
		expect(
			schema?.safeParse({
				questionId: "q-1",
				suggestedScore: -1,
				reason: "x",
			}).success,
		).toBe(false)

		// Empty reason rejected.
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
