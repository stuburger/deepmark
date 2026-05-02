import * as fs from "node:fs"
import * as path from "node:path"
import { generateText } from "ai"
import { beforeAll, describe, expect, it } from "vitest"
import { normalizeQuestionNumber } from "../../src/lib/grading/normalize-question-number"
import { callLlmWithFallback } from "../../src/lib/infra/llm-runtime"
import { outputSchema } from "../../src/lib/infra/output-schema"
import {
	EXTRACT_METADATA_PROMPT,
	EXTRACT_QUESTIONS_PROMPT,
} from "../../src/processors/question-paper-pdf/prompts"
import {
	QuestionPaperMetadataSchema,
	QuestionPaperSchema,
} from "../../src/processors/question-paper-pdf/schema"
import { validateMarks } from "../../src/processors/question-paper-pdf/validate-marks"
import { GCSE_BUSINESS_YR9_GWA_2_FIXTURE } from "./fixtures/question-paper-sections/gcse-business-yr9-gwa-2/fixture"
import type { QuestionPaperSectionsFixture } from "./fixtures/question-paper-sections/shared-types"

/**
 * End-to-end eval for marks extraction. Real LLM call against the production
 * prompts + schemas (both the questions extraction and metadata extraction).
 *
 * The expectations enforce:
 *   1. Each fixture-specified question's `total_marks` matches the paper.
 *   2. When the paper prints "(N marks)" next to a question, the extractor
 *      populates `printed_marks` with the same N (validates the new field
 *      and the prompt's "literal copy, do not infer" rule).
 *   3. Section subtotals match the per-section sum.
 *   4. The paper-wide total matches the section sum.
 *   5. `validateMarks(...)` returns no discrepancies — which is the same
 *      check the production processor runs to attach the teacher-facing
 *      warning. Catches the historical bleed where Section A's "2"
 *      (organic growth, 2 marks) inherited 12 marks from Section B's
 *      "02." (franchising, 12 marks).
 */

const FIXTURES: QuestionPaperSectionsFixture[] = [
	GCSE_BUSINESS_YR9_GWA_2_FIXTURE,
]
const EXTRACTION_TIMEOUT_MS = 5 * 60_000

type ExtractedQuestion = {
	question_number?: string
	total_marks?: number
	printed_marks?: number | null
}

type ExtractedSection = {
	title?: string
	total_marks?: number
	printed_total_marks?: number | null
	questions?: ExtractedQuestion[]
}

type ExtractorOutput = {
	sections?: ExtractedSection[]
}

type MetadataOutput = {
	total_marks?: number
	printed_total_marks?: number | null
}

function canonical(raw: string): string {
	return normalizeQuestionNumber(raw)
}

function findQuestion(
	output: ExtractorOutput,
	questionNumber: string,
): ExtractedQuestion | null {
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

describe.each(FIXTURES)("marks extraction — $name", (fixture) => {
	let output: ExtractorOutput
	let metadata: MetadataOutput

	beforeAll(async () => {
		const pdfPath = path.join(fixture.dir, fixture.pdf_filename)
		const pdfBase64 = fs.readFileSync(pdfPath).toString("base64")

		const [questionsResult, metadataResult] = await Promise.all([
			callLlmWithFallback(
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
			),
			callLlmWithFallback(
				"question-paper-metadata",
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
									{ type: "text", text: EXTRACT_METADATA_PROMPT },
								],
							},
						],
						output: outputSchema(QuestionPaperMetadataSchema),
					})
					report.usage = r.usage
					return r
				},
			),
		])

		output = questionsResult.output as ExtractorOutput
		metadata = metadataResult.output as MetadataOutput
	}, EXTRACTION_TIMEOUT_MS)

	it("Eval 1 — every fixture-specified question has the expected total_marks", () => {
		const expectations = fixture.marksExpectations ?? []
		expect(
			expectations.length,
			"fixture must declare marks expectations",
		).toBeGreaterThan(0)

		for (const spec of expectations) {
			const q = findQuestion(output, spec.questionNumber)
			expect(
				q,
				`question_number ${spec.questionNumber} must be present`,
			).not.toBeNull()
			expect(q?.total_marks, `total_marks for Q${spec.questionNumber}`).toBe(
				spec.marks,
			)
		}
	})

	it("Eval 2 — printed_marks matches when the paper prints '(N marks)' next to the question", () => {
		const expectations = fixture.marksExpectations ?? []
		for (const spec of expectations) {
			if (!spec.printedInParens) continue
			const q = findQuestion(output, spec.questionNumber)
			expect(
				q?.printed_marks,
				`printed_marks for Q${spec.questionNumber} must equal the literal "(${spec.marks} marks)" printed on the paper`,
			).toBe(spec.marks)
		}
	})

	it("Eval 3 — section totals match the sum of question marks within each section", () => {
		for (const expectedSection of fixture.sections) {
			const actual = (output.sections ?? []).find(
				(s) => s.title?.trim() === expectedSection.title.trim(),
			)
			expect(
				actual,
				`section "${expectedSection.title}" must be present`,
			).toBeDefined()
			const summed = (actual?.questions ?? []).reduce(
				(acc, q) => acc + (q.total_marks ?? 0),
				0,
			)
			expect(
				summed,
				`sum of question marks in "${expectedSection.title}"`,
			).toBe(expectedSection.total_marks)
		}
	})

	it("Eval 4 — paper total matches the sum of section totals", () => {
		const summed = (output.sections ?? []).reduce(
			(acc, s) =>
				acc + (s.questions ?? []).reduce((q, x) => q + (x.total_marks ?? 0), 0),
			0,
		)
		expect(summed, "paper-wide sum of question marks").toBe(fixture.total_marks)

		if (fixture.paperTotalPrintedOnCover) {
			expect(
				metadata.printed_total_marks,
				"printed_total_marks must mirror the paper's cover total",
			).toBe(fixture.total_marks)
		}
	})

	it("Eval 5 — validateMarks reports no discrepancies (production parity)", () => {
		const discrepancies = validateMarks({
			paper_printed_total_marks: metadata.printed_total_marks ?? null,
			sections: (output.sections ?? []).map((s) => ({
				title: s.title ?? "",
				total_marks: s.total_marks ?? 0,
				printed_total_marks: s.printed_total_marks ?? null,
				questions: (s.questions ?? []).map((q) => ({
					total_marks: q.total_marks ?? 0,
					printed_marks: q.printed_marks ?? null,
					question_number: q.question_number,
				})),
			})),
		})
		expect(
			discrepancies,
			`validateMarks discrepancies: ${JSON.stringify(discrepancies, null, 2)}`,
		).toEqual([])
	})
})
