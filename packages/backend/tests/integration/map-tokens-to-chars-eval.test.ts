import { sortTokensSpatially } from "@mcp-gcse/shared"
import { describe, expect, it } from "vitest"
import { createLlmRunner } from "../../src/lib/infra/llm-runtime"
import {
	type TokenCharMapping,
	mapTokensToChars,
} from "../../src/lib/scan-extraction/map-tokens-to-chars"
import {
	type Q02FixtureToken,
	Q02_ANSWER_TEXT,
	Q02_TOKENS,
} from "./fixtures/q02-char-mapping/fixture"

/**
 * Option C eval — tests whether an LLM can map OCR tokens directly to
 * character ranges in a pre-authored answer text, eliminating the need for
 * the client-side fuzzy alignment heuristic.
 *
 * This is a prompt-performance eval: no DB access, no attribution pipeline.
 * The fixture is a known-good Q02 answer + its real production tokens.
 * If this eval passes reliably, we can wire `mapTokensToChars` into the
 * attribution pipeline and persist `answer_char_start/end` directly —
 * see `docs/build-plan-option-c-token-char-mapping.md`.
 *
 * Change `MODEL_OVERRIDE` to compare models on the same data.
 */

const MODEL_OVERRIDE = {
	provider: "google" as const,
	model: "gemini-2.5-flash",
	temperature: 0.1,
}

const EVAL_TIMEOUT_MS = 2 * 60_000

// ── Helpers ────────────────────────────────────────────────────────────────

function createRunner() {
	return createLlmRunner({
		"token-char-mapping": [MODEL_OVERRIDE],
	})
}

function levenshtein(a: string, b: string): number {
	const m = a.length
	const n = b.length
	if (m === 0) return n
	if (n === 0) return m
	let prev = Array.from({ length: n + 1 }, (_, i) => i)
	for (let i = 1; i <= m; i++) {
		const curr = [i]
		for (let j = 1; j <= n; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1
			curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
		}
		prev = curr
	}
	return prev[n]
}

function normalizedDistance(a: string, b: string): number {
	const maxLen = Math.max(a.length, b.length)
	if (maxLen === 0) return 0
	return levenshtein(a, b) / maxLen
}

/**
 * Sort tokens per-page into spatial reading order, then flatten across pages
 * in ascending page order. This matches the order the attribution LLM uses
 * when authoring `answer_text`.
 */
function spatiallySortFixture(tokens: Q02FixtureToken[]): Q02FixtureToken[] {
	const byPage = new Map<number, Q02FixtureToken[]>()
	for (const t of tokens) {
		const list = byPage.get(t.page_order) ?? []
		list.push(t)
		byPage.set(t.page_order, list)
	}
	return Array.from(byPage.keys())
		.sort((a, b) => a - b)
		.flatMap((page) => sortTokensSpatially(byPage.get(page) ?? []))
}

// ── Client heuristic (mirror of apps/web/src/lib/marking/alignment/align.ts) ─
// Duplicated here because tests can't cross package boundaries. Kept minimal
// and in sync with the production implementation — only needed to produce a
// comparable `char_start/char_end` per token for the head-to-head metric.

type HeuristicToken = { id: string; text_raw: string; text_corrected: string | null }

function splitWithOffsets(
	text: string,
): Array<{ word: string; start: number; end: number }> {
	const result: Array<{ word: string; start: number; end: number }> = []
	const regex = /\S+/g
	for (let m = regex.exec(text); m !== null; m = regex.exec(text)) {
		result.push({ word: m[0], start: m.index, end: m.index + m[0].length })
	}
	return result
}

function heuristicAlign(
	answer: string,
	tokens: HeuristicToken[],
): Record<string, { start: number; end: number }> {
	const MAX_DISTANCE = 0.4
	const LOOK_AHEAD = 8
	const answerWords = splitWithOffsets(answer)
	const tokenMap: Record<string, { start: number; end: number }> = {}
	const assigned = new Set<number>()
	let wordCursor = 0

	for (const token of tokens) {
		if (wordCursor >= answerWords.length) break
		const tokenText = (token.text_corrected ?? token.text_raw).toLowerCase()
		if (tokenText.length === 0) continue
		let bestIdx = -1
		let bestDist = Number.POSITIVE_INFINITY
		const searchEnd = Math.min(wordCursor + LOOK_AHEAD, answerWords.length)
		for (let i = wordCursor; i < searchEnd; i++) {
			const d = normalizedDistance(tokenText, answerWords[i].word.toLowerCase())
			if (d < bestDist) {
				bestDist = d
				bestIdx = i
			}
		}
		if (bestIdx >= 0 && bestDist <= MAX_DISTANCE) {
			const aw = answerWords[bestIdx]
			tokenMap[token.id] = { start: aw.start, end: aw.end }
			assigned.add(bestIdx)
			wordCursor = bestIdx + 1
		}
	}

	const unmatched = tokens.filter((t) => !tokenMap[t.id])
	if (unmatched.length > 0 && assigned.size > 0) {
		const freeIdx: number[] = []
		for (let i = 0; i < answerWords.length; i++) {
			if (!assigned.has(i)) freeIdx.push(i)
		}
		const limit = Math.min(unmatched.length, freeIdx.length)
		for (let i = 0; i < limit; i++) {
			const aw = answerWords[freeIdx[i]]
			tokenMap[unmatched[i].id] = { start: aw.start, end: aw.end }
		}
	}

	return tokenMap
}

// ── Shared metrics ─────────────────────────────────────────────────────────

type AlignedEntry = { char_start: number | null; char_end: number | null }

function metrics(
	tokens: Q02FixtureToken[],
	entries: AlignedEntry[],
): {
	correctedCoverage: number
	correctedViolationRate: number
	allViolationRate: number
	orderingPct: number
	totalCoverage: number
	correctedViolations: string[]
	allViolations: string[]
} {
	const correctedIdx = tokens
		.map((t, i) => (t.text_corrected ? i : -1))
		.filter((i) => i >= 0)

	const mappedCorrected = correctedIdx.filter(
		(i) => entries[i].char_start !== null,
	).length
	const correctedCoverage = mappedCorrected / Math.max(correctedIdx.length, 1)

	const correctedViolations: string[] = []
	const allViolations: string[] = []
	let mappedAll = 0

	for (let i = 0; i < tokens.length; i++) {
		const m = entries[i]
		if (m.char_start === null || m.char_end === null) continue
		mappedAll++
		const expected = (tokens[i].text_corrected ?? tokens[i].text_raw).toLowerCase()
		if (expected.length <= 1) continue
		const mapped = Q02_ANSWER_TEXT.slice(m.char_start, m.char_end).toLowerCase()
		const d = normalizedDistance(mapped, expected)
		if (d > 0.4) {
			const line = `[${i}] "${tokens[i].text_raw}"${tokens[i].text_corrected ? `→"${tokens[i].text_corrected}"` : ""} mapped to "${mapped}" (d=${d.toFixed(2)})`
			allViolations.push(line)
			if (tokens[i].text_corrected) correctedViolations.push(line)
		}
	}

	const correctedViolationRate =
		correctedViolations.length / Math.max(mappedCorrected, 1)
	const allViolationRate = allViolations.length / Math.max(mappedAll, 1)

	const charStarts = entries
		.map((m) => m.char_start)
		.filter((s): s is number => s !== null)
	let nondec = 0
	for (let i = 1; i < charStarts.length; i++) {
		if (charStarts[i] >= charStarts[i - 1]) nondec++
	}
	const orderingPct =
		charStarts.length > 1 ? nondec / (charStarts.length - 1) : 1

	const totalCoverage = mappedAll / tokens.length

	return {
		correctedCoverage,
		correctedViolationRate,
		allViolationRate,
		orderingPct,
		totalCoverage,
		correctedViolations,
		allViolations,
	}
}

function fmtPct(n: number): string {
	return `${(n * 100).toFixed(1)}%`
}

// ── Eval ──────────────────────────────────────────────────────────────────

describe("map-tokens-to-chars eval — Q02 Subhaan Baig", () => {
	it(
		"LLM maps spatially-sorted tokens to correct char ranges in answer_text",
		async () => {
			const sorted = spatiallySortFixture(Q02_TOKENS)

			const llm = createRunner()
			const result = await mapTokensToChars({
				answerText: Q02_ANSWER_TEXT,
				tokens: sorted.map((t) => ({
					text_raw: t.text_raw,
					text_corrected: t.text_corrected,
				})),
				llm,
			})

			// 1. Exact count — LLM must return one mapping per input token, in order.
			expect(
				result.mappings,
				"mapper must return exactly one entry per input token",
			).toHaveLength(sorted.length)

			for (let i = 0; i < sorted.length; i++) {
				expect(
					result.mappings[i].token_index,
					`mapping[${i}] must reference token_index ${i}`,
				).toBe(i)
			}

			// 2. Bounds — non-null word indices must resolve to a real word,
			//    and paired char offsets must lie inside answer_text.
			for (const m of result.mappings) {
				if (m.word_index === null) {
					expect(
						m.char_start === null && m.char_end === null,
						`null word_index must pair with null char offsets: ${JSON.stringify(m)}`,
					).toBe(true)
					continue
				}
				expect(m.word_index).toBeGreaterThanOrEqual(0)
				expect(m.word_index).toBeLessThan(result.words.length)
				expect(m.char_start).not.toBeNull()
				expect(m.char_end).not.toBeNull()
				if (m.char_start !== null && m.char_end !== null) {
					expect(m.char_end).toBeGreaterThan(m.char_start)
					expect(m.char_end).toBeLessThanOrEqual(Q02_ANSWER_TEXT.length)
				}
			}

			// 3. Coverage — tokens the LLM authoritatively corrected should almost
			//    all land on an answer word.
			const correctedIndices = sorted
				.map((t, i) => (t.text_corrected ? i : -1))
				.filter((i) => i >= 0)
			const mappedCorrected = correctedIndices.filter(
				(i) => result.mappings[i].char_start !== null,
			).length
			const correctedCoverage = mappedCorrected / correctedIndices.length
			console.log(
				`  Corrected-token coverage: ${mappedCorrected}/${correctedIndices.length} (${Math.round(correctedCoverage * 100)}%)`,
			)
			expect(correctedCoverage).toBeGreaterThan(0.9)

			// 4. Correctness — for each mapped LLM-corrected token, the answer
			//    substring at its range should fuzzy-match the corrected text.
			//    This is the invariant the production failure violated.
			const violations: string[] = []
			for (const i of correctedIndices) {
				const token = sorted[i]
				const m = result.mappings[i]
				if (m.char_start === null || m.char_end === null) continue
				const expected = (token.text_corrected ?? "").toLowerCase()
				if (expected.length <= 1) continue
				const mapped = Q02_ANSWER_TEXT.slice(
					m.char_start,
					m.char_end,
				).toLowerCase()
				const d = normalizedDistance(mapped, expected)
				if (d > 0.4) {
					violations.push(
						`  [${i}] "${token.text_raw}"→"${expected}" mapped to "${mapped}" (d=${d.toFixed(2)})`,
					)
				}
			}
			console.log(
				`  Correctness violations: ${violations.length}/${mappedCorrected}`,
			)
			if (violations.length > 0) {
				console.log(violations.slice(0, 20).join("\n"))
			}
			const violationRate = violations.length / Math.max(mappedCorrected, 1)
			expect(
				violationRate,
				`more than 10% of LLM-corrected tokens landed on wrong words:\n${violations.slice(0, 10).join("\n")}`,
			).toBeLessThan(0.1)

			// 5. Ordering — mapped ranges should advance through the answer text
			//    roughly monotonically (small back-steps allowed for fragments and
			//    duplicate tokens like trailing punctuation).
			const charStarts = result.mappings
				.map((m) => m.char_start)
				.filter((s): s is number => s !== null)
			let nondecreasing = 0
			for (let i = 1; i < charStarts.length; i++) {
				if (charStarts[i] >= charStarts[i - 1]) nondecreasing++
			}
			const orderingPct =
				charStarts.length > 1 ? nondecreasing / (charStarts.length - 1) : 1
			console.log(
				`  Ordering: ${Math.round(orderingPct * 100)}% non-decreasing`,
			)
			expect(orderingPct).toBeGreaterThan(0.85)

			// 6. Cost visibility
			const snapshot = llm.toSnapshot()
			const eff = snapshot.effective["token-char-mapping"]
			console.log(
				`  Tokens used: ${eff?.prompt_tokens} prompt + ${eff?.completion_tokens} completion`,
			)
		},
		EVAL_TIMEOUT_MS,
	)

	it(
		"LLM mapper beats the client heuristic on the same spatially-sorted input",
		async () => {
			const sorted = spatiallySortFixture(Q02_TOKENS)

			// ── Heuristic ─────────────────────────────────────────────────────
			const heuristicTokenMap = heuristicAlign(
				Q02_ANSWER_TEXT,
				sorted.map((t) => ({
					id: t.id,
					text_raw: t.text_raw,
					text_corrected: t.text_corrected,
				})),
			)
			const heuristicEntries: AlignedEntry[] = sorted.map((t) => {
				const r = heuristicTokenMap[t.id]
				return r
					? { char_start: r.start, char_end: r.end }
					: { char_start: null, char_end: null }
			})
			const h = metrics(sorted, heuristicEntries)

			// ── LLM mapper ────────────────────────────────────────────────────
			const llm = createRunner()
			const { mappings } = await mapTokensToChars({
				answerText: Q02_ANSWER_TEXT,
				tokens: sorted.map((t) => ({
					text_raw: t.text_raw,
					text_corrected: t.text_corrected,
				})),
				llm,
			})
			const llmEntries: AlignedEntry[] = mappings.map(
				(m: TokenCharMapping) => ({
					char_start: m.char_start,
					char_end: m.char_end,
				}),
			)
			const l = metrics(sorted, llmEntries)

			// ── Report ────────────────────────────────────────────────────────
			console.log("\n  ┌─────────────────────────────────┬─────────┬─────────┐")
			console.log("  │ Metric                          │  Heur.  │  LLM    │")
			console.log("  ├─────────────────────────────────┼─────────┼─────────┤")
			console.log(
				`  │ Corrected-token coverage        │ ${fmtPct(h.correctedCoverage).padStart(7)} │ ${fmtPct(l.correctedCoverage).padStart(7)} │`,
			)
			console.log(
				`  │ Total coverage (all tokens)     │ ${fmtPct(h.totalCoverage).padStart(7)} │ ${fmtPct(l.totalCoverage).padStart(7)} │`,
			)
			console.log(
				`  │ Wrong-word rate (corrected)     │ ${fmtPct(h.correctedViolationRate).padStart(7)} │ ${fmtPct(l.correctedViolationRate).padStart(7)} │`,
			)
			console.log(
				`  │ Wrong-word rate (ALL mapped)    │ ${fmtPct(h.allViolationRate).padStart(7)} │ ${fmtPct(l.allViolationRate).padStart(7)} │`,
			)
			console.log(
				`  │ Ordering (non-decreasing)       │ ${fmtPct(h.orderingPct).padStart(7)} │ ${fmtPct(l.orderingPct).padStart(7)} │`,
			)
			console.log("  └─────────────────────────────────┴─────────┴─────────┘")
			console.log(
				`\n  Heuristic wrong-word mappings across ALL tokens (${h.allViolations.length}):`,
			)
			for (const v of h.allViolations.slice(0, 20)) console.log(`    ${v}`)
			if (h.allViolations.length > 20) {
				console.log(`    …and ${h.allViolations.length - 20} more`)
			}
			console.log(
				`\n  LLM wrong-word mappings across ALL tokens (${l.allViolations.length}):`,
			)
			for (const v of l.allViolations.slice(0, 20)) console.log(`    ${v}`)
			if (l.allViolations.length > 20) {
				console.log(`    …and ${l.allViolations.length - 20} more`)
			}

			// ── Assertion ─────────────────────────────────────────────────────
			// The real test of Option C: does the LLM produce fewer wrong-word
			// mappings than the heuristic across ALL tokens (not just
			// LLM-corrected ones)? The heuristic's Pass 2 positional fill
			// blindly assigns junk tokens (stray dots, "5 | Page") to leftover
			// answer words, producing ghost highlights. The LLM is allowed to
			// return null for those — that's its advantage.
			expect(
				l.allViolations.length,
				"LLM mapper must produce fewer wrong-word mappings than the heuristic across all tokens to justify wiring",
			).toBeLessThan(h.allViolations.length)
		},
		EVAL_TIMEOUT_MS,
	)
})
