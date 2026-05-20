import { describe, expect, it } from "vitest"
import { deriveConversationTitle, truncateTitle } from "../title"

describe("deriveConversationTitle", () => {
	it("uses the first user message's text", () => {
		const title = deriveConversationTitle([
			{ role: "system", parts: [{ type: "text", text: "ignored" }] },
			{
				role: "user",
				parts: [{ type: "text", text: "Mark Q3 correct please" }],
			},
			{ role: "assistant", parts: [{ type: "text", text: "Done." }] },
		])
		expect(title).toBe("Mark Q3 correct please")
	})

	it("returns null when no user message has been sent yet", () => {
		expect(deriveConversationTitle([])).toBeNull()
		expect(
			deriveConversationTitle([
				{ role: "system", parts: [{ type: "text", text: "preamble" }] },
			]),
		).toBeNull()
	})

	it("returns null when the user message has no text parts", () => {
		expect(
			deriveConversationTitle([
				{
					role: "user",
					parts: [{ type: "data-selection" }],
				},
			]),
		).toBeNull()
	})

	it("skips a user message whose text is whitespace-only", () => {
		// Possible if the teacher sent with just a selection chip and no
		// typed text. Fall through to look for the next user turn.
		const title = deriveConversationTitle([
			{ role: "user", parts: [{ type: "text", text: "   " }] },
			{ role: "assistant", parts: [{ type: "text", text: "x" }] },
			{ role: "user", parts: [{ type: "text", text: "Mark this correct" }] },
		])
		expect(title).toBe("Mark this correct")
	})

	it("joins multiple text parts on a single message", () => {
		const title = deriveConversationTitle([
			{
				role: "user",
				parts: [
					{ type: "text", text: "Part one" },
					{ type: "text", text: "part two" },
				],
			},
		])
		expect(title).toBe("Part one part two")
	})

	it("collapses whitespace and trims", () => {
		const title = deriveConversationTitle([
			{
				role: "user",
				parts: [{ type: "text", text: "  hello\n\nworld   today  " }],
			},
		])
		expect(title).toBe("hello world today")
	})
})

describe("truncateTitle", () => {
	it("returns short strings unchanged", () => {
		expect(truncateTitle("short")).toBe("short")
	})

	it("collapses whitespace before measuring length", () => {
		expect(truncateTitle("a\n\nb\tc")).toBe("a b c")
	})

	it("trims trailing whitespace before appending the ellipsis", () => {
		// 60 chars then 5 more — the boundary may land mid-word; trim
		// trailing space so we don't get "word …".
		const sixtyOne = `${"a".repeat(58)} bb`
		expect(truncateTitle(sixtyOne).endsWith("…")).toBe(true)
		expect(truncateTitle(sixtyOne)).not.toContain(" …")
	})

	it("caps long strings at the limit with a trailing ellipsis", () => {
		const long = "x".repeat(120)
		const out = truncateTitle(long)
		expect(out.endsWith("…")).toBe(true)
		// 60 x's + ellipsis = 61 chars (the ellipsis is a single char).
		expect(out.length).toBe(61)
	})
})
