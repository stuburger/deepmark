import { describe, expect, it } from "vitest"
import { derivePillDisplay } from "../tool-call-pill"

describe("derivePillDisplay", () => {
	it("labels known tool names via TOOL_LABELS", () => {
		const d = derivePillDisplay({
			toolName: "addAnnotation",
			state: "input-streaming",
		})
		expect(d.label).toBe("annotation")
	})

	it("falls back to the raw tool name when not in the label map", () => {
		const d = derivePillDisplay({
			toolName: "unknownTool",
			state: "input-streaming",
		})
		expect(d.label).toBe("unknownTool")
	})

	it("returns pending while the SDK is streaming input", () => {
		const d = derivePillDisplay({
			toolName: "addAnnotation",
			state: "input-streaming",
		})
		expect(d.status).toBe("pending")
		expect(d.detail).toBeNull()
	})

	it("returns pending when input is fully available but output isn't", () => {
		const d = derivePillDisplay({
			toolName: "addAnnotation",
			state: "input-available",
			input: { phrase: "test" },
		})
		expect(d.status).toBe("pending")
	})

	it("returns ok on output-available with ok=true", () => {
		const d = derivePillDisplay({
			toolName: "addAnnotation",
			state: "output-available",
			output: { ok: true, annotationId: "abc" },
		})
		expect(d.status).toBe("ok")
		expect(d.detail).toBeNull()
	})

	it("treats output-available with no ok flag as success", () => {
		// proposeTeacherOverride's output shape uses `accepted`, not `ok`.
		// We default to success so the pill doesn't show a false error.
		const d = derivePillDisplay({
			toolName: "proposeTeacherOverride",
			state: "output-available",
			output: { accepted: true },
		})
		expect(d.status).toBe("ok")
	})

	it("returns error on output-available with ok=false and captures reason", () => {
		const d = derivePillDisplay({
			toolName: "addAnnotation",
			state: "output-available",
			output: { ok: false, reason: "Phrase not found" },
		})
		expect(d.status).toBe("error")
		expect(d.detail).toBe("Phrase not found")
	})

	it("returns error on output-error and captures errorText", () => {
		const d = derivePillDisplay({
			toolName: "addAnnotation",
			state: "output-error",
			errorText: "Tool invocation crashed",
		})
		expect(d.status).toBe("error")
		expect(d.detail).toBe("Tool invocation crashed")
	})

	it("extracts and quotes the phrase from input when present", () => {
		const d = derivePillDisplay({
			toolName: "addAnnotation",
			state: "input-available",
			input: { phrase: "the quick brown fox" },
		})
		expect(d.phrase).toBe('"the quick brown fox"')
	})

	it("truncates long phrases to ~40 chars", () => {
		const long = "a".repeat(80)
		const d = derivePillDisplay({
			toolName: "addAnnotation",
			state: "input-available",
			input: { phrase: long },
		})
		expect(d.phrase).toMatch(/…"$/)
		expect((d.phrase ?? "").length).toBeLessThan(50)
	})

	it("returns null phrase when input has no phrase field", () => {
		const d = derivePillDisplay({
			toolName: "removeAnnotation",
			state: "input-available",
			input: { annotationId: "abc" },
		})
		expect(d.phrase).toBeNull()
	})

	it("returns null phrase when input is missing entirely", () => {
		const d = derivePillDisplay({
			toolName: "addAnnotation",
			state: "input-streaming",
		})
		expect(d.phrase).toBeNull()
	})
})
