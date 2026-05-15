import { describe, expect, it } from "vitest"
import {
	LOR_EXEMPLAR_BANK,
	flattenedExemplars,
	levelBand,
	renderTemplateMarkScheme,
} from "../integration/fixtures/lor-exemplar-bank"

describe("LoR Exemplar Reference Bank — structure", () => {
	it("contains the expected question coverage by mark total", () => {
		const byMarks = new Map<number, number>()
		for (const q of LOR_EXEMPLAR_BANK) {
			byMarks.set(q.totalMarks, (byMarks.get(q.totalMarks) ?? 0) + 1)
		}
		// 4-mark: 1; 6-mark (Justify + Analyse): 4; 9-mark: 8; 12-mark: 4.
		expect(byMarks.get(4)).toBe(1)
		expect(byMarks.get(6)).toBe(4)
		expect(byMarks.get(9)).toBe(8)
		expect(byMarks.get(12)).toBe(4)
	})

	it("every question has L1, top Level, and a Fake trap", () => {
		for (const q of LOR_EXEMPLAR_BANK) {
			const ids = new Set(q.answers.map((a) => a.id))
			expect(ids.has("L1"), `${q.id} missing L1`).toBe(true)
			const topLevel = q.totalMarks >= 12 ? "L4" : "L3"
			expect(ids.has(topLevel), `${q.id} missing ${topLevel}`).toBe(true)
			const hasTrap = q.answers.some((a) => a.expected.isTrap)
			expect(hasTrap, `${q.id} missing Fake exemplar`).toBe(true)
		}
	})

	it("trap exemplars target a Level below the top (cannot be a top-Level cap)", () => {
		for (const q of LOR_EXEMPLAR_BANK) {
			const topLevel = q.totalMarks >= 12 ? 4 : 3
			for (const a of q.answers) {
				if (a.expected.isTrap) {
					expect(
						a.expected.level,
						`${q.id}/${a.id} trap caps at top Level — no test signal`,
					).toBeLessThan(topLevel)
				}
			}
		}
	})

	it("expected mark ranges fall within the template's level bands", () => {
		for (const q of LOR_EXEMPLAR_BANK) {
			for (const a of q.answers) {
				const band = levelBand(q.templateKey, a.expected.level)
				expect(
					band,
					`${q.id}/${a.id} expected Level ${a.expected.level} has no band in template ${q.templateKey}`,
				).not.toBeNull()
				if (!band) continue
				expect(
					a.expected.markMin,
					`${q.id}/${a.id} markMin ${a.expected.markMin} below band min ${band.min}`,
				).toBeGreaterThanOrEqual(band.min)
				expect(
					a.expected.markMax,
					`${q.id}/${a.id} markMax ${a.expected.markMax} above band max ${band.max}`,
				).toBeLessThanOrEqual(band.max)
			}
		}
	})

	it("flattens to exactly the expected total exemplar count", () => {
		const flat = flattenedExemplars()
		// 1×4 (4-mark) + 4×4 (6-mark) + 8×4 (9-mark) + 4×5 (12-mark) = 4+16+32+20 = 72
		expect(flat).toHaveLength(72)
	})

	it("renders deterministic mark scheme content for each template", () => {
		// Two calls with the same (templateKey, indicative) must be byte-identical.
		for (const q of LOR_EXEMPLAR_BANK) {
			const a = renderTemplateMarkScheme(q.templateKey, q.indicativeContent)
			const b = renderTemplateMarkScheme(q.templateKey, q.indicativeContent)
			expect(a).toBe(b)
			// Must mention each Level header at least once.
			const topLevel = q.totalMarks >= 12 ? 4 : 3
			for (let lvl = 1; lvl <= topLevel; lvl++) {
				expect(a).toContain(`**Level ${lvl}`)
			}
			// Should contain the indicative content text passed in.
			expect(a).toContain(q.indicativeContent.split(" ").slice(0, 4).join(" "))
		}
	})
})
