import { describe, expect, it } from "vitest"
import { preCorrectFromTranscripts } from "../../src/lib/scan-extraction/transcript-pre-correct"

function tok(id: string, pageOrder: number, text: string) {
	return { id, page_order: pageOrder, text_raw: text }
}

describe("preCorrectFromTranscripts", () => {
	it("corrects garbled OCR tokens against Gemini transcript", () => {
		const tokens = [
			tok("t1", 1, "menbrane"),
			tok("t2", 1, "conrols"),
			tok("t3", 1, "movment"),
		]
		const transcripts = [
			{ page: 1, transcript: "membrane controls movement" },
		]

		const corrections = preCorrectFromTranscripts(tokens, transcripts)

		expect(corrections).toHaveLength(3)
		expect(corrections[0]).toEqual({ id: "t1", textCorrected: "membrane" })
		expect(corrections[1]).toEqual({ id: "t2", textCorrected: "controls" })
		expect(corrections[2]).toEqual({ id: "t3", textCorrected: "movement" })
	})

	it("skips tokens that already match the transcript exactly", () => {
		const tokens = [
			tok("t1", 1, "The"),
			tok("t2", 1, "membrane"),
		]
		const transcripts = [{ page: 1, transcript: "The membrane" }]

		const corrections = preCorrectFromTranscripts(tokens, transcripts)

		// "The" and "membrane" match exactly — no corrections needed
		expect(corrections).toHaveLength(0)
	})

	it("skips tokens with high distance (no good match)", () => {
		const tokens = [
			tok("t1", 1, "07"),
			tok("t2", 1, "xyz"),
		]
		const transcripts = [{ page: 1, transcript: "of the" }]

		const corrections = preCorrectFromTranscripts(tokens, transcripts)

		// "07" vs "of" — normalised distance = 1.0 (completely different)
		// "xyz" vs "the" — normalised distance > 0.4
		expect(corrections).toHaveLength(0)
	})

	it("handles multiple pages independently", () => {
		const tokens = [
			tok("t1", 1, "menbrane"),
			tok("t2", 2, "fotosynthesis"),
		]
		const transcripts = [
			{ page: 1, transcript: "membrane" },
			{ page: 2, transcript: "photosynthesis" },
		]

		const corrections = preCorrectFromTranscripts(tokens, transcripts)

		expect(corrections).toHaveLength(2)
		expect(corrections[0]).toEqual({ id: "t1", textCorrected: "membrane" })
		expect(corrections[1]).toEqual({
			id: "t2",
			textCorrected: "photosynthesis",
		})
	})

	it("returns empty for pages with no transcript", () => {
		const tokens = [tok("t1", 1, "menbrane")]
		const transcripts = [{ page: 2, transcript: "membrane" }]

		const corrections = preCorrectFromTranscripts(tokens, transcripts)

		expect(corrections).toHaveLength(0)
	})

	it("returns empty for empty inputs", () => {
		expect(preCorrectFromTranscripts([], [])).toEqual([])
		expect(
			preCorrectFromTranscripts([], [{ page: 1, transcript: "hello" }]),
		).toEqual([])
		expect(preCorrectFromTranscripts([tok("t1", 1, "hello")], [])).toEqual(
			[],
		)
	})

	it("handles transcript with more words than tokens", () => {
		const tokens = [tok("t1", 1, "membane")]
		const transcripts = [
			{
				page: 1,
				transcript: "The cell membrane controls the movement of substances",
			},
		]

		const corrections = preCorrectFromTranscripts(tokens, transcripts)

		// Should match "membane" → "membrane" within the look-ahead window
		expect(corrections).toHaveLength(1)
		expect(corrections[0]).toEqual({ id: "t1", textCorrected: "membrane" })
	})

	it("advances cursor correctly with mixed matches", () => {
		const tokens = [
			tok("t1", 1, "The"),
			tok("t2", 1, "cel"), // garbled "cell"
			tok("t3", 1, "membrane"),
			tok("t4", 1, "conrols"), // garbled "controls"
		]
		const transcripts = [
			{ page: 1, transcript: "The cell membrane controls" },
		]

		const corrections = preCorrectFromTranscripts(tokens, transcripts)

		// "The" matches exactly — no correction
		// "cel" matches "cell" — correction
		// "membrane" matches exactly — no correction
		// "conrols" matches "controls" — correction
		expect(corrections).toHaveLength(2)
		expect(corrections[0]).toEqual({ id: "t2", textCorrected: "cell" })
		expect(corrections[1]).toEqual({ id: "t4", textCorrected: "controls" })
	})
})
