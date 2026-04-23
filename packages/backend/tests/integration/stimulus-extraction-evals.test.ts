import * as fs from "node:fs"
import * as path from "node:path"
import { generateText } from "ai"
import { beforeAll, describe, expect, it } from "vitest"
import { normalizeQuestionNumber } from "../../src/lib/grading/normalize-question-number"
import { callLlmWithFallback } from "../../src/lib/infra/llm-runtime"
import { outputSchema } from "../../src/lib/infra/output-schema"
import { EXTRACT_QUESTIONS_PROMPT } from "../../src/processors/question-paper-pdf/prompts"
import { QuestionPaperSchema } from "../../src/processors/question-paper-pdf/schema"
import { GCSE_BUSINESS_YR9_GWA_2_FIXTURE } from "./fixtures/question-paper-sections/gcse-business-yr9-gwa-2/fixture"
import type { QuestionPaperSectionsFixture } from "./fixtures/question-paper-sections/shared-types"

/**
 * End-to-end eval for case-study / stimulus extraction.
 *
 * Real LLM call against the production prompt + schema. The expectations
 * check that stimuli are:
 *   1. Emitted once per section via `sections[].stimuli[]` (not duplicated
 *      into each question's text).
 *   2. Referenced from questions via `stimulus_labels`.
 *   3. Absent from `question_text` — the question body must be the clean
 *      instruction, not the case study glued in front.
 *   4. Never attached to MCQs or standalone written questions that don't
 *      reference a source.
 *
 * Uses the same fixture as the section-segmentation eval — adds stimulus
 * expectations to the fixture spec rather than a new PDF.
 */

const FIXTURES: QuestionPaperSectionsFixture[] = [
	GCSE_BUSINESS_YR9_GWA_2_FIXTURE,
]
const EXTRACTION_TIMEOUT_MS = 5 * 60_000

type ExtractorOutput = {
	sections?: Array<{
		title?: string
		stimuli?: Array<{ label?: string; content?: string }>
		questions?: Array<{
			question_number?: string
			question_text?: string
			stimulus_labels?: string[]
		}>
	}>
}

/**
 * Test-local canonical form. Uses the shared normaliser (strips leading "Q/
 * Question", brackets, spaces, dots-before-letter) without stripping leading
 * zeros or trailing dots — those distinguish Section A's "2" (plain written
 * Q2) from Section B's "02." (leading-zero-with-dot top-level Q2). The
 * prompt asks the LLM to preserve the printed form, so fixtures do too.
 */
function canonical(raw: string): string {
	return normalizeQuestionNumber(raw)
}

function findQuestion(
	output: ExtractorOutput,
	questionNumber: string,
): { question_text?: string; stimulus_labels?: string[] } | null {
	const target = canonical(questionNumber)
	for (const section of output.sections ?? []) {
		for (const q of section.questions ?? []) {
			if (q.question_number && canonical(q.question_number) === target) {
				return q
			}
		}
	}
	return null
}

function findStimulus(
	output: ExtractorOutput,
	label: string,
): { label?: string; content?: string } | null {
	for (const section of output.sections ?? []) {
		for (const s of section.stimuli ?? []) {
			if (s.label === label) return s
		}
	}
	return null
}

describe.each(FIXTURES)("stimulus extraction — $name", (fixture) => {
	let output: ExtractorOutput

	beforeAll(async () => {
		const pdfPath = path.join(fixture.dir, fixture.pdf_filename)
		const pdfBase64 = fs.readFileSync(pdfPath).toString("base64")

		const result = await callLlmWithFallback(
			"question-paper-extraction",
			async (model, entry, report) => {
				const r = await generateText({
					model,
					temperature: entry.temperature,
					messages: [
						{
							role: "user",
							content: [
								{
									type: "file" as const,
									data: pdfBase64,
									mediaType: "application/pdf",
								},
								{ type: "text", text: EXTRACT_QUESTIONS_PROMPT },
							],
						},
					],
					output: outputSchema(QuestionPaperSchema),
				})
				report.usage = r.usage
				return r
			},
		)

		output = result.output as ExtractorOutput
	}, EXTRACTION_TIMEOUT_MS)

	it("Eval 1 — each question has the expected stimulus_labels", () => {
		const expectations = fixture.stimulusExpectations ?? []
		for (const spec of expectations) {
			const q = findQuestion(output, spec.questionNumber)
			expect(
				q,
				`question_number ${spec.questionNumber} must be present`,
			).not.toBeNull()
			const actual = q?.stimulus_labels ?? []
			expect(
				actual.sort(),
				`stimulus_labels for Q${spec.questionNumber}`,
			).toEqual([...spec.labels].sort())
		}
	})

	it("Eval 2 — every referenced stimulus label exists in sections.stimuli", () => {
		const expectations = fixture.stimulusExpectations ?? []
		for (const spec of expectations) {
			for (const label of spec.labels) {
				const s = findStimulus(output, label)
				expect(
					s,
					`stimulus labelled "${label}" referenced by Q${spec.questionNumber} must be defined in a section's stimuli array`,
				).not.toBeNull()
				expect(
					s?.content?.trim().length ?? 0,
					`stimulus "${label}" must have non-empty content`,
				).toBeGreaterThan(0)
			}
		}
	})

	it("Eval 3 — stimulus content contains the expected distinctive phrases", () => {
		const expectations = fixture.stimulusExpectations ?? []
		for (const spec of expectations) {
			if (!spec.contentMustContain?.length) continue
			for (const label of spec.labels) {
				const s = findStimulus(output, label)
				if (!s) continue // Eval 2 already fails for this
				const content = s.content ?? ""
				for (const phrase of spec.contentMustContain) {
					expect(
						content.toLowerCase(),
						`stimulus "${label}" content must contain "${phrase}"`,
					).toContain(phrase.toLowerCase())
				}
			}
		}
	})

	it("Eval 4 — question_text is clean (case study NOT glued into question body)", () => {
		const expectations = fixture.stimulusExpectations ?? []
		for (const spec of expectations) {
			if (!spec.questionTextMustNotContain?.length) continue
			const q = findQuestion(output, spec.questionNumber)
			const text = q?.question_text?.toLowerCase() ?? ""
			for (const forbidden of spec.questionTextMustNotContain) {
				expect(
					text,
					`Q${spec.questionNumber} question_text must NOT contain "${forbidden}" (belongs in the stimulus)`,
				).not.toContain(forbidden.toLowerCase())
			}
		}
	})

	it("Eval 5 — question_text contains the actual question instruction", () => {
		const expectations = fixture.stimulusExpectations ?? []
		for (const spec of expectations) {
			if (!spec.questionTextMustContain?.length) continue
			const q = findQuestion(output, spec.questionNumber)
			const text = q?.question_text?.toLowerCase() ?? ""
			for (const required of spec.questionTextMustContain) {
				expect(
					text,
					`Q${spec.questionNumber} question_text must contain "${required}"`,
				).toContain(required.toLowerCase())
			}
		}
	})
})
