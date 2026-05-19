import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { alignTokensToAnswer } from "../../src/editor/alignment/align"
import type { PageToken } from "../../src/editor/types"

/**
 * Alignment regression fixture — real student answer pulled from
 * production via Neon (grading_run cmpcna0km00012zw3poayeq4s,
 * question_id cmp8npx1v000b5pw3k0b78zn7, English Lang P1 Q4).
 *
 * Why this fixture: the symptom in the UI smoke test was Levenshtein
 * cursor drift across paragraph boundaries in long handwritten answers.
 * A common-word misread (e.g. "to" misread as "the") sends the cursor
 * forward by N positions; subsequent tokens land in the wrong paragraph.
 *
 * The answer spans 3 paragraphs (2118 chars) with several distinctive
 * long words ("Broughton", "exposition", "trembles", "unaccountably")
 * spread across them. These anchors give the test surgical hooks: each
 * appears exactly ONCE in the clean answer text and Vision OCR'd them
 * with high enough confidence to be matchable. The aligner should land
 * each on its single occurrence — anything else is drift.
 */

type RawToken = {
	id: string
	page_order: number
	text_raw: string
	text_corrected: string | null
	bbox: [number, number, number, number]
	confidence: number
}

function loadFixture(): {
	answer: string
	tokens: PageToken[]
	tokensByText: Map<string, RawToken[]>
} {
	const dir = join(__dirname, "fixtures/alignment/pearson-q4")
	const answer = readFileSync(join(dir, "answer.txt"), "utf-8")
	const raw = JSON.parse(
		readFileSync(join(dir, "tokens.json"), "utf-8"),
	) as RawToken[]

	const tokens: PageToken[] = raw.map((t) => ({
		id: t.id,
		page_order: t.page_order,
		para_index: 0,
		line_index: 0,
		word_index: 0,
		text_raw: t.text_raw,
		text_corrected: t.text_corrected,
		bbox: t.bbox,
		confidence: t.confidence,
		question_id: null,
		answer_char_start: null,
		answer_char_end: null,
	}))

	const tokensByText = new Map<string, RawToken[]>()
	for (const t of raw) {
		const list = tokensByText.get(t.text_raw) ?? []
		list.push(t)
		tokensByText.set(t.text_raw, list)
	}

	return { answer, tokens, tokensByText }
}

describe("alignTokensToAnswer — Pearson Q4 fixture (drift regression)", () => {
	const fixture = loadFixture()
	const result = alignTokensToAnswer(fixture.answer, fixture.tokens)

	// ─── Layer 1 — basic invariants (should always hold) ────────────────────

	it("at least 70% of tokens are mapped (handwriting OCR ceiling)", () => {
		// Note: this is NOT a coverage-of-answer-words metric. Vision OCR
		// emits more "word" tokens than the consolidated answer text (it
		// counts punctuation as separate tokens, splits compound words,
		// etc.), so 100% token coverage is mathematically impossible. A
		// 70% floor catches catastrophic regressions while accepting the
		// ~25% punctuation/filler that has no destination in the answer.
		const mapped = Object.keys(result.tokenMap).length
		const ratio = mapped / fixture.tokens.length
		expect(
			ratio,
			`only ${mapped}/${fixture.tokens.length} tokens mapped (${(ratio * 100).toFixed(1)}%)`,
		).toBeGreaterThanOrEqual(0.7)
	})

	it("every mapped range is within answer bounds and non-degenerate", () => {
		const violations: string[] = []
		for (const [tokenId, range] of Object.entries(result.tokenMap)) {
			if (range.start < 0) violations.push(`${tokenId}: start < 0`)
			if (range.end <= range.start)
				violations.push(`${tokenId}: end <= start`)
			if (range.end > fixture.answer.length)
				violations.push(`${tokenId}: end > answer length`)
		}
		expect(violations).toEqual([])
	})

	// ─── Layer 2 — distinctive-word anchor accuracy ─────────────────────────
	//
	// Each distinctive word below appears exactly ONCE in the clean answer
	// and Vision OCR'd it. The aligner MUST land the corresponding token's
	// char range on that single occurrence. If it lands elsewhere (or
	// nowhere), the alignment has drifted — exactly the symptom we want
	// to catch.

	const DISTINCTIVE_ANCHORS: Array<{
		text: string
		// Optional: which occurrence in answer (0-indexed). Defaults to 0
		// since these words are unique. Useful if we add a fixture later
		// where the same anchor word legitimately appears twice.
		occurrence?: number
	}> = [
		{ text: "Broughton" },
		{ text: "exposition" },
		{ text: "trembles" },
		{ text: "unaccountably" },
	]

	for (const anchor of DISTINCTIVE_ANCHORS) {
		it(`'${anchor.text}' token aligns to its unique occurrence in the answer`, () => {
			const matchingTokens = fixture.tokensByText.get(anchor.text) ?? []
			expect(
				matchingTokens.length,
				`fixture must contain a token with text_raw="${anchor.text}"; got ${matchingTokens.length}`,
			).toBeGreaterThan(0)

			// Expected char position in the clean answer
			const expectedStart = fixture.answer.indexOf(anchor.text)
			expect(
				expectedStart,
				`distinctive anchor "${anchor.text}" must appear in the answer`,
			).toBeGreaterThanOrEqual(0)

			// The aligner should map at least one token with this text to a
			// range overlapping the expected position. Allow ±5 chars
			// tolerance so we don't fail on punctuation/whitespace nudges.
			const TOLERANCE = 5
			const hits = matchingTokens.filter((t) => {
				const r = result.tokenMap[t.id]
				if (!r) return false
				return Math.abs(r.start - expectedStart) <= TOLERANCE
			})

			expect(
				hits.length,
				`expected token "${anchor.text}" to align near char ${expectedStart} (±${TOLERANCE}); actual mapped positions: ${matchingTokens.map((t) => result.tokenMap[t.id]?.start ?? "unmapped").join(", ")}`,
			).toBeGreaterThan(0)
		})
	}

	// ─── Layer 3 — no cross-paragraph drift ─────────────────────────────────
	//
	// A token whose distinctive word lives in paragraph N must not align
	// to a position inside paragraph M for any M ≠ N. We sample one
	// distinctive anchor per paragraph and assert each one stays in its
	// own paragraph's char range.

	const PARAGRAPH_BOUNDARIES = (() => {
		// Paragraphs are separated by literal "\n" in this answer
		const starts: number[] = [0]
		for (let i = 0; i < fixture.answer.length; i++) {
			if (fixture.answer[i] === "\n") starts.push(i + 1)
		}
		const boundaries: Array<{ index: number; start: number; end: number }> =
			[]
		for (let i = 0; i < starts.length; i++) {
			boundaries.push({
				index: i,
				start: starts[i],
				end: i + 1 < starts.length ? starts[i + 1] : fixture.answer.length,
			})
		}
		return boundaries
	})()

	// Token text → expected paragraph index
	const PARAGRAPH_ANCHORS: Array<{ text: string; paragraph: number }> = [
		{ text: "Broughton", paragraph: 0 }, // para 1 (the title line)
		{ text: "trembles", paragraph: 1 }, // para 2 (middle)
		{ text: "unaccountably", paragraph: 2 }, // para 3 (end)
	]

	for (const a of PARAGRAPH_ANCHORS) {
		it(`'${a.text}' stays within paragraph ${a.paragraph}`, () => {
			const para = PARAGRAPH_BOUNDARIES[a.paragraph]
			expect(para, `paragraph ${a.paragraph} must exist`).toBeDefined()

			const matching = fixture.tokensByText.get(a.text) ?? []
			const firstMapped = matching
				.map((t) => result.tokenMap[t.id])
				.find((r) => r !== undefined)
			expect(
				firstMapped,
				`token "${a.text}" must be mapped somewhere`,
			).toBeDefined()
			if (!firstMapped) return

			expect(
				firstMapped.start >= para.start && firstMapped.end <= para.end,
				`"${a.text}" mapped to char ${firstMapped.start} but paragraph ${a.paragraph} is [${para.start}, ${para.end})`,
			).toBe(true)
		})
	}
})
