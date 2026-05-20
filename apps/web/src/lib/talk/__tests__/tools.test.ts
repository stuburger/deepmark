import { describe, expect, it } from "vitest"
import { buildTalkTools, signalToMarkName } from "../tools"

describe("buildTalkTools", () => {
	it("returns undefined when submissionId is absent (general-assistant mode)", () => {
		expect(buildTalkTools(undefined)).toBeUndefined()
	})

	it("returns the registered tools when submissionId is present", () => {
		const tools = buildTalkTools("sub-1")
		expect(tools).toBeDefined()
		// proposeTeacherOverride is intentionally NOT registered in this
		// commit — confirm-card UX lands in a follow-up.
		expect(Object.keys(tools ?? {})).toEqual([
			"addAnnotation",
			"updateAnnotation",
			"removeAnnotation",
			"linkToScan",
		])
	})

	it("accepts addAnnotation with phrase (primary path)", () => {
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

	it("accepts addAnnotation with tokenStart + tokenEnd (selection path)", () => {
		const tools = buildTalkTools("sub-1")
		const schema = tools?.addAnnotation?.inputSchema as
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
	})

	it("rejects addAnnotation with both phrase and tokens (must be exactly one path)", () => {
		const tools = buildTalkTools("sub-1")
		const schema = tools?.addAnnotation?.inputSchema as
			| { safeParse: (input: unknown) => { success: boolean } }
			| undefined

		expect(
			schema?.safeParse({
				questionId: "q-1",
				phrase: "climate change",
				tokenStart: "tok-1",
				tokenEnd: "tok-3",
				signal: "tick",
				reason: "x",
			}).success,
		).toBe(false)
	})

	it("rejects addAnnotation with partial token range (start without end)", () => {
		const tools = buildTalkTools("sub-1")
		const schema = tools?.addAnnotation?.inputSchema as
			| { safeParse: (input: unknown) => { success: boolean } }
			| undefined

		expect(
			schema?.safeParse({
				questionId: "q-1",
				tokenStart: "tok-1",
				signal: "tick",
				reason: "x",
			}).success,
		).toBe(false)
	})

	it("rejects addAnnotation with no address at all", () => {
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

	// proposeTeacherOverride schema test deferred — re-add when the
	// confirm-card UX lands and the tool is re-registered in
	// buildTalkTools.
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
