import { describe, expect, it } from "vitest"
import { buildAnnotationPrompt } from "../../src/lib/annotations/annotation-prompt"
import type {
	AoAwardEntry,
	GradingResult,
} from "../../src/lib/grading/grade-questions"

function baseResult(): GradingResult {
	return {
		_v: 1,
		question_id: "q1",
		question_number: "1",
		question_text:
			"FreshBlend is considering offering a loyalty card scheme. Justify whether this is a good decision.",
		student_answer:
			"One way FreshBlend Smoothie Bar could increase customer footfall is by introducing a loyalty card scheme. For example, customers could receive a free drink after purchasing five smoothies.",
		awarded_score: 6,
		max_score: 6,
		llm_reasoning: "Two fully developed points with explicit application.",
		feedback_summary: "L3, full marks — two developed points.",
		marking_method: "level_of_response",
		level_awarded: 3,
		why_not_next_level: "",
		cap_applied: "",
		what_went_well: ["Strong AO2 application", "Clear chains of reasoning"],
		even_better_if: [],
		mark_points_results: [],
		mark_scheme_id: "ms1",
	}
}

function tokens(text: string) {
	return text.split(/\s+/).map((t, i) => ({ text: t, pageOrder: 1 + i }))
}

function aoAward(
	overrides: Partial<AoAwardEntry> & {
		descriptor_evaluations: AoAwardEntry["descriptor_evaluations"]
	},
): AoAwardEntry {
	return {
		ao_code: "Overall",
		level_awarded: 3,
		awarded_marks: 6,
		max_marks: 6,
		why_not_next_level: "",
		...overrides,
	}
}

describe("buildAnnotationPrompt — LoR descriptor evaluations", () => {
	const promptArgs = () => {
		const words = tokens(baseResult().student_answer)
		const labeledWords = words.map((w, i) => `[t${i + 1}]${w.text}`).join(" ")
		return {
			gradingResult: baseResult(),
			questionText: baseResult().question_text,
			maxScore: 6,
			labeledWords,
			labeledWordCount: words.length,
			examBoard: "AQA",
			subject: "business",
			markScheme: null,
			levelDescriptors: null,
		}
	}

	it("renders the AoAwards block when ao_awards are present", () => {
		const args = promptArgs()
		args.gradingResult.ao_awards = [
			aoAward({
				descriptor_evaluations: [
					{
						descriptor: "Multi-step chains of reasoning on both sides",
						met: true,
						evidence:
							"customers could receive a free drink after purchasing five smoothies",
					},
					{
						descriptor: "Conditional 'it depends' judgement",
						met: false,
						evidence: "no contextual contingency present",
					},
				],
			}),
		]
		const prompt = buildAnnotationPrompt(args)

		expect(prompt).toContain("<AoAwards>")
		expect(prompt).toContain("Multi-step chains of reasoning on both sides")
		expect(prompt).toContain("MET ✓")
		expect(prompt).toContain("NOT MET ✗")
		expect(prompt).toContain("customers could receive a free drink")
		expect(prompt).toContain("no contextual contingency present")
	})

	it("omits the AoAwards block when ao_awards are absent (point-based path)", () => {
		const args = promptArgs()
		args.gradingResult.ao_awards = undefined
		const prompt = buildAnnotationPrompt(args)
		// The strategy text mentions <AoAwards> as a conditional reference,
		// so check that the rendered section header is absent instead.
		expect(prompt).not.toContain("### Award 1 —")
		expect(prompt).not.toContain("MET ✓")
	})

	it("density tracks evaluation count when ao_awards are present", () => {
		const args = promptArgs()
		args.gradingResult.ao_awards = [
			aoAward({
				descriptor_evaluations: [
					{ descriptor: "d1", met: true, evidence: "quote one" },
					{ descriptor: "d2", met: true, evidence: "quote two" },
					{ descriptor: "d3", met: false, evidence: "missing" },
					{ descriptor: "d4", met: false, evidence: "missing" },
					{ descriptor: "d5", met: false, evidence: "missing" },
				],
			}),
		]
		const prompt = buildAnnotationPrompt(args)
		// Five evaluations → density target should mention ~5.
		expect(prompt).toMatch(/Target ~5 signal annotations/)
	})

	it("density falls back to score-based heuristic when ao_awards are absent", () => {
		const args = promptArgs()
		args.gradingResult.ao_awards = undefined
		const prompt = buildAnnotationPrompt(args)
		// maxScore=6 → densityTarget = {min:3, max:5, maxComments:3}
		expect(prompt).toMatch(/Target 3-5 signal annotations total/)
	})

	it("sums evaluations across multiple AO awards for multi-skill marking", () => {
		const args = promptArgs()
		args.gradingResult.ao_awards = [
			aoAward({
				ao_code: "AO5",
				descriptor_evaluations: [
					{ descriptor: "ao5-a", met: true, evidence: "quote" },
					{ descriptor: "ao5-b", met: false, evidence: "gap" },
				],
			}),
			aoAward({
				ao_code: "AO6",
				descriptor_evaluations: [
					{ descriptor: "ao6-a", met: true, evidence: "quote" },
					{ descriptor: "ao6-b", met: true, evidence: "quote" },
					{ descriptor: "ao6-c", met: false, evidence: "gap" },
				],
			}),
		]
		const prompt = buildAnnotationPrompt(args)
		expect(prompt).toMatch(/Target ~5 signal annotations/)
		expect(prompt).toContain("Award 1 — AO5")
		expect(prompt).toContain("Award 2 — AO6")
	})

	it("annotation strategy mentions descriptor evaluations as the canonical source", () => {
		const args = promptArgs()
		args.gradingResult.ao_awards = [
			aoAward({
				descriptor_evaluations: [
					{ descriptor: "d", met: true, evidence: "quote" },
				],
			}),
		]
		const prompt = buildAnnotationPrompt(args)
		expect(prompt).toContain("CANONICAL anchor source")
		expect(prompt).toContain("evidence quote")
	})
})
