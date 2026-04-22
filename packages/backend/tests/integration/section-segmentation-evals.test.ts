import * as fs from "node:fs"
import * as path from "node:path"
import { generateText } from "ai"
import { beforeAll, describe, expect, it } from "vitest"
import { callLlmWithFallback } from "../../src/lib/infra/llm-runtime"
import { outputSchema } from "../../src/lib/infra/output-schema"
import { EXTRACT_QUESTIONS_PROMPT } from "../../src/processors/question-paper-pdf/prompts"
import { QuestionPaperSchema } from "../../src/processors/question-paper-pdf/schema"
import { GCSE_BUSINESS_YR9_GWA_2_FIXTURE } from "./fixtures/question-paper-sections/gcse-business-yr9-gwa-2/fixture"
import type { QuestionPaperSectionsFixture } from "./fixtures/question-paper-sections/shared-types"

/**
 * End-to-end eval for question-paper section segmentation.
 *
 * Real LLM call against the production prompt + schema (imported directly
 * from the processor so this test tracks whatever shape the extractor
 * currently emits — no duplicate schema to drift).
 *
 * These evals fail today because the extractor is section-agnostic:
 *   1. `QuestionPaperSchema` is a flat `{ questions: [...] }` — no sections.
 *   2. `EXTRACT_QUESTIONS_PROMPT` never mentions sections.
 *   3. `linkJobQuestionsToExamPaper` collapses all output into a single
 *      `"Section 1"` row anyway.
 *
 * Turning these evals green requires wrapping `questions` in a `sections`
 * array in the schema, adding section-detection rules to the prompt, and
 * updating the linker to persist multiple sections. No DB migration needed —
 * `ExamSection` + `ExamSectionQuestion` already support the shape.
 */

const FIXTURES: QuestionPaperSectionsFixture[] = [
	GCSE_BUSINESS_YR9_GWA_2_FIXTURE,
]
const EXTRACTION_TIMEOUT_MS = 5 * 60_000

type ExtractorOutput = {
	questions?: unknown
	// After the fix: `sections: [{ title, total_marks, questions: [...] }]`.
	// Declared loosely so the test compiles today (when the schema doesn't
	// yet emit it) and against the future shape (when it does).
	sections?: Array<{
		title?: string
		total_marks?: number
		questions?: Array<{
			question_number?: string
			total_marks?: number
		}>
	}>
}

describe.each(FIXTURES)(
	"question-paper section segmentation — $name",
	(fixture) => {
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

		it("Eval 1 — produces a `sections` array with one entry per printed section", () => {
			expect(
				output.sections,
				"extractor output must include a top-level `sections` array",
			).toBeDefined()
			expect(output.sections).toHaveLength(fixture.sections.length)
		})

		it("Eval 2 — each section has the correct title", () => {
			const titles = (output.sections ?? []).map((s) => s.title?.trim())
			for (const expected of fixture.sections) {
				expect(
					titles.some((t) =>
						t?.toLowerCase().includes(expected.title.toLowerCase()),
					),
					`expected a section titled like "${expected.title}", got ${JSON.stringify(titles)}`,
				).toBe(true)
			}
		})

		it("Eval 3 — each section's total_marks matches the paper header", () => {
			for (const expected of fixture.sections) {
				const match = (output.sections ?? []).find((s) =>
					s.title?.toLowerCase().includes(expected.title.toLowerCase()),
				)
				expect(
					match,
					`section "${expected.title}" must be present`,
				).toBeDefined()
				expect(
					match?.total_marks,
					`section "${expected.title}" total_marks`,
				).toBe(expected.total_marks)
			}
		})

		it("Eval 4 — each section contains the expected number of questions", () => {
			for (const expected of fixture.sections) {
				const match = (output.sections ?? []).find((s) =>
					s.title?.toLowerCase().includes(expected.title.toLowerCase()),
				)
				expect(match?.questions?.length).toBe(expected.question_count)
			}
		})

		it("Eval 5 — the 12-marker lives in Section B, not Section A", () => {
			// Sanity check on the exact failure Geoff hit: the 12-mark franchising
			// question ("02.") was persisted into the only-section-in-the-paper
			// alongside Section A's 2-markers. A correct segmentation puts any
			// 12-mark question into Section B.
			const sectionB = (output.sections ?? []).find((s) =>
				s.title?.toLowerCase().includes("section b"),
			)
			expect(sectionB, "Section B must be present").toBeDefined()

			const twelveMarker = sectionB?.questions?.find(
				(q) => q.total_marks === 12,
			)
			expect(
				twelveMarker,
				"Section B must contain a 12-mark question (the franchising analyse)",
			).toBeDefined()

			const sectionA = (output.sections ?? []).find((s) =>
				s.title?.toLowerCase().includes("section a"),
			)
			const strayTwelveMarker = sectionA?.questions?.find(
				(q) => q.total_marks === 12,
			)
			expect(
				strayTwelveMarker,
				"Section A must NOT contain a 12-mark question",
			).toBeUndefined()
		})

		it("Eval 6 — whole-paper total_marks equals the sum of section totals", () => {
			const sum = (output.sections ?? []).reduce(
				(acc, s) => acc + (s.total_marks ?? 0),
				0,
			)
			expect(sum).toBe(fixture.total_marks)
		})
	},
)
