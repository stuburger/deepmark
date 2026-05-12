import * as fs from "node:fs"
import * as path from "node:path"
import { generateText } from "ai"
import { describe, expect, it } from "vitest"
import { callLlmWithFallback } from "../../src/lib/infra/llm-runtime"
import { outputSchema } from "../../src/lib/infra/output-schema"
import {
	buildExistingQuestionsBlock,
	buildExtractionPrompt,
} from "../../src/processors/mark-scheme-pdf/prompts"
import { MarkSchemeSchema } from "../../src/processors/mark-scheme-pdf/schema"
import { Y10_MEDIA_ENGLISH_FIXTURE } from "./fixtures/mark-scheme-extraction/y10-media-english/fixture"

/**
 * End-to-end eval for the mark-scheme extraction LLM call.
 *
 * Real Gemini, real PDF, real prompt + schema (imported from the processor
 * so this test tracks whatever shape the extractor currently emits — no
 * duplicate schema to drift). No DB, no S3 — we drive the LLM call
 * directly with the same arguments the production handler builds.
 *
 * What this fixture proves:
 *   0. Extraction completes successfully against a large, image-scanned
 *      mark scheme — this exact paper hit the old 90 s wall-clock four
 *      times in a row in production. With the Lambda envelope fix the
 *      Lambda would have given it ~470 s; here we pass an explicit 240 s
 *      `timeoutMs` to mirror that behaviour and assert it lands.
 *
 *   1. Every existing question in the EXISTING QUESTIONS prompt context
 *      gets `matched_question_id` populated by at least one extracted
 *      mark scheme entry. A silent regression in the matching prompt
 *      would surface as orphan ids.
 *
 * Cost: one real Gemini Flash call per run (~$0.02). Worth it — this
 * regression class chewed 4× the LLM spend in production.
 */

const FIXTURE = Y10_MEDIA_ENGLISH_FIXTURE
const EXTRACTION_TIMEOUT_MS = 4 * 60_000

describe(`mark scheme extraction — ${FIXTURE.name}`, () => {
	let result: {
		questions: Array<{
			question_number?: string
			marking_method?: string | null
			matched_question_id?: string | null
		}>
	}

	it(
		"extracts the mark scheme and matches every existing question",
		async () => {
			const pdfPath = path.join(FIXTURE.dir, FIXTURE.pdf_filename)
			const pdfBase64 = fs.readFileSync(pdfPath).toString("base64")

			const existingBlock = buildExistingQuestionsBlock(
				FIXTURE.existingQuestions,
			)
			const prompt = buildExtractionPrompt(existingBlock)

			// Mirrors the handler's call shape exactly — same callSiteKey,
			// same schema, same prompt. The explicit 240 s `timeoutMs`
			// stands in for a Lambda envelope; the runner default 90 s
			// would (still) time out on this fixture.
			const { output } = await callLlmWithFallback(
				"mark-scheme-extraction",
				async (model, entry, report, signal) => {
					const r = await generateText({
						model,
						abortSignal: signal,
						temperature: entry.temperature,
						messages: [
							{
								role: "user",
								content: [
									{
										type: "file",
										data: pdfBase64,
										mediaType: "application/pdf",
									},
									{ type: "text", text: prompt },
								],
							},
						],
						output: outputSchema(MarkSchemeSchema),
					})
					report.usage = r.usage
					return r
				},
				{ timeoutMs: 240_000 },
			)

			// Assertion 0: extraction completed and emitted at least one
			// question. (Empty output is the smoking-gun shape of a prompt
			// or schema regression; the rest of the assertions imply this
			// already, but we surface it as a separate, named expectation.)
			expect(output).toBeDefined()
			expect(Array.isArray(output.questions)).toBe(true)
			expect(output.questions.length).toBeGreaterThan(0)
			result = output as typeof result
		},
		EXTRACTION_TIMEOUT_MS,
	)

	it("matches every existing question to at least one extracted mark scheme", () => {
		expect(result).toBeDefined()

		const matchedIds = new Set(
			(result.questions ?? [])
				.map((q) => q.matched_question_id)
				.filter((id): id is string => typeof id === "string" && id.length > 0),
		)
		const expectedIds = FIXTURE.existingQuestions.map((q) => q.id)
		const orphans = expectedIds.filter((id) => !matchedIds.has(id))

		// Surface which ids weren't matched so a regression is debuggable
		// at a glance rather than a bare "expected 14, got 13".
		expect(
			orphans,
			`Existing questions with no matched_question_id in extraction output: ${orphans.join(", ")}`,
		).toEqual([])
	})
})
