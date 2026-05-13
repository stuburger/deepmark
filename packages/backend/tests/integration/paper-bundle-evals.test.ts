import * as fs from "node:fs"
import { generateText } from "ai"
import { describe, expect, it } from "vitest"
import { callLlmWithFallback } from "../../src/lib/infra/llm-runtime"
import { outputSchema } from "../../src/lib/infra/output-schema"
import { PAPER_BUNDLE_PROMPT } from "../../src/processors/paper-bundle/prompts"
import {
	type PaperBundle,
	PaperBundleSchema,
} from "../../src/processors/paper-bundle/schema"
import { validateBundle } from "../../src/processors/paper-bundle/validate"
import {
	AQA_BUSINESS_Y10_3_3_VOL2_FIXTURE,
	fixturePath,
} from "./fixtures/paper-bundle/aqa-business-y10-3-3-vol2/fixture"

/**
 * Paper-bundle eval suite.
 *
 * Real Gemini, real PDFs, real prompt + schema imported from the processor. No
 * mocks. Proves the core wizard bet — that a single LLM call can ingest QP +
 * MS together and emit a fully linked structure ready for atomic persistence.
 *
 * Whenever you touch:
 *   - packages/backend/src/processors/paper-bundle.ts
 *   - packages/backend/src/processors/paper-bundle/*.ts
 * run this suite before committing. All runnable evals must be green.
 *
 * Workflow rules (mirror attribution-evals):
 *   - Add a new fixture whenever a real-world paper reveals a gap.
 *   - Pull fixture data from Neon production via mcp__Neon__run_sql.
 *   - Tighten thresholds when the model improves; never loosen.
 *   - No mocking.
 *
 * Cost: ~$0.05 per fixture per run (Gemini Flash + two PDFs).
 */

const BUNDLE_TIMEOUT_MS = 4 * 60_000

const FIXTURES = [AQA_BUSINESS_Y10_3_3_VOL2_FIXTURE]

for (const fixture of FIXTURES) {
	describe(`paper bundle extraction — ${fixture.name}`, () => {
		let bundle: PaperBundle

		it(
			"extracts a bundle that validates and matches expected metadata shape",
			async () => {
				const qpBase64 = fs
					.readFileSync(fixturePath(fixture, fixture.qpFilename))
					.toString("base64")
				const msBase64 = fs
					.readFileSync(fixturePath(fixture, fixture.msFilename))
					.toString("base64")

				const { output } = await callLlmWithFallback(
					"paper-bundle-extraction",
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
											data: qpBase64,
											mediaType: "application/pdf",
										},
										{
											type: "file",
											data: msBase64,
											mediaType: "application/pdf",
										},
										{ type: "text", text: PAPER_BUNDLE_PROMPT },
									],
								},
							],
							output: outputSchema(PaperBundleSchema),
						})
						report.usage = r.usage
						return r
					},
					{ timeoutMs: BUNDLE_TIMEOUT_MS },
				)

				bundle = output

				// ── Top-level validation (the persister's own gate) ─────────
				const validation = validateBundle(bundle)
				expect(validation.ok, `validateBundle: ${"error" in validation ? validation.error : ""}`).toBe(true)

				// ── Metadata sanity ─────────────────────────────────────────
				expect(bundle.metadata.title).toBeTruthy()
				const title = (bundle.metadata.title ?? "").toLowerCase()
				for (const needle of fixture.expected.titleContains) {
					expect(title).toContain(needle)
				}
				expect(bundle.metadata.subject).toBe(fixture.expected.subject)
				expect(bundle.metadata.exam_board ?? "").toContain(
					fixture.expected.examBoardContains,
				)

				// ── Section + question shape ────────────────────────────────
				expect(bundle.sections.length).toBeGreaterThanOrEqual(
					fixture.expected.minSections,
				)
				const totalQuestions = bundle.sections.reduce(
					(acc, s) => acc + s.questions.length,
					0,
				)
				expect(totalQuestions).toBeGreaterThanOrEqual(
					fixture.expected.minQuestions,
				)

				// ── Every question carries a non-empty mark scheme ──────────
				for (const section of bundle.sections) {
					for (const q of section.questions) {
						expect(q.mark_scheme, `Q${q.question_number ?? "?"} missing mark_scheme`).toBeTruthy()
						const method = q.mark_scheme.marking_method
						if (method === "point_based") {
							expect(
								q.mark_scheme.mark_points.length,
								`Q${q.question_number ?? "?"} point_based has no mark_points`,
							).toBeGreaterThanOrEqual(1)
						} else if (method === "level_of_response") {
							expect(
								(q.mark_scheme.levels ?? []).length,
								`Q${q.question_number ?? "?"} level_of_response has no levels`,
							).toBeGreaterThanOrEqual(1)
						} else if (method === "deterministic") {
							expect(
								q.mark_scheme.correct_option,
								`Q${q.question_number ?? "?"} deterministic has no correct_option`,
							).toBeTruthy()
						}
					}
				}
			},
			BUNDLE_TIMEOUT_MS + 30_000,
		)

		it("printed paper total matches sum of section totals when both are populated", () => {
			if (!bundle) return
			const printedPaperTotal = bundle.metadata.printed_total_marks
			if (printedPaperTotal == null) return
			const sectionPrintedSum = bundle.sections.reduce(
				(acc, s) => acc + (s.printed_total_marks ?? 0),
				0,
			)
			if (sectionPrintedSum === 0) return
			expect(sectionPrintedSum).toBe(printedPaperTotal)
		})
	})
}

// TODO: add a second fixture from production once Stuart supplies the English
// paper S3 keys. Bundle MS partner already exists at tmp/english-lit-mark-
// scheme-cmobrht6s.pdf — needs the paired question paper.
