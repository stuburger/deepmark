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
import { AQA_BUSINESS_Y10_3_3_VOL2_FIXTURE } from "./fixtures/paper-bundle/aqa-business-y10-3-3-vol2/fixture"
import { EDEXCEL_ENGLISH_LANG_P1_MAY_2025_FIXTURE } from "./fixtures/paper-bundle/edexcel-english-lang-p1-may-2025/fixture"
import { fixturePath, type PaperBundleFixture } from "./fixtures/paper-bundle/types"

/**
 * Paper-bundle eval suite.
 *
 * Real Gemini, real PDFs, real prompt + schema imported from the processor. No
 * mocks. Proves the core wizard bet — that a single LLM call can ingest QP +
 * MS (+ optional stimulus pack) together and emit a fully linked structure
 * ready for atomic persistence.
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
 * Cost: ~$0.05 per fixture per run (Gemini Flash + 2-3 PDFs).
 */

const BUNDLE_TIMEOUT_MS = 4 * 60_000

const FIXTURES: PaperBundleFixture[] = [
	AQA_BUSINESS_Y10_3_3_VOL2_FIXTURE,
	EDEXCEL_ENGLISH_LANG_P1_MAY_2025_FIXTURE,
]

for (const fixture of FIXTURES) {
	const qpPath = fixturePath(fixture, fixture.qpFilename)
	const msPath = fixturePath(fixture, fixture.msFilename)
	const stimulusPath = fixture.stimulusFilename
		? fixturePath(fixture, fixture.stimulusFilename)
		: null

	// A fixture sometimes lives in the tree before its files arrive (e.g. the
	// English fixture is committed but the clean QP is missing until Stuart
	// drops it in). Skip rather than red-fail in that window.
	const filesReady =
		fs.existsSync(qpPath) &&
		fs.existsSync(msPath) &&
		(stimulusPath === null || fs.existsSync(stimulusPath))

	describe(`paper bundle extraction — ${fixture.name}`, () => {
		let bundle: PaperBundle

		const maybeIt = filesReady ? it : it.skip

		maybeIt(
			"extracts a bundle that validates and matches expected metadata shape",
			async () => {
				const qpBase64 = fs.readFileSync(qpPath).toString("base64")
				const msBase64 = fs.readFileSync(msPath).toString("base64")
				const stimulusBase64 = stimulusPath
					? fs.readFileSync(stimulusPath).toString("base64")
					: null

				const { output } = await callLlmWithFallback(
					"paper-bundle-extraction",
					async (model, entry, report, signal) => {
						const content: Array<
							| {
									type: "file"
									data: string
									mediaType: "application/pdf"
							  }
							| { type: "text"; text: string }
						> = [
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
						]
						if (stimulusBase64) {
							content.push({
								type: "file",
								data: stimulusBase64,
								mediaType: "application/pdf",
							})
						}
						content.push({ type: "text", text: PAPER_BUNDLE_PROMPT })

						const r = await generateText({
							model,
							abortSignal: signal,
							temperature: entry.temperature,
							messages: [{ role: "user", content }],
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
				expect(
					validation.ok,
					`validateBundle: ${"error" in validation ? validation.error : ""}`,
				).toBe(true)

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
						expect(
							q.mark_scheme,
							`Q${q.question_number ?? "?"} missing mark_scheme`,
						).toBeTruthy()
						const method = q.mark_scheme.marking_method
						if (method === "point_based") {
							expect(
								q.mark_scheme.mark_points.length,
								`Q${q.question_number ?? "?"} point_based has no mark_points`,
							).toBeGreaterThanOrEqual(1)
						} else if (method === "level_of_response") {
							const lor = q.mark_scheme.lor_extraction
							expect(
								lor,
								`Q${q.question_number ?? "?"} level_of_response missing lor_extraction`,
							).toBeTruthy()
							if (lor) {
								expect(
									lor.ao_dimensions.length,
									`Q${q.question_number ?? "?"} lor_extraction has no ao_dimensions`,
								).toBeGreaterThanOrEqual(1)
								for (const dim of lor.ao_dimensions) {
									expect(
										dim.levels.length,
										`Q${q.question_number ?? "?"} dimension "${dim.ao_code}" has no levels`,
									).toBeGreaterThanOrEqual(1)
								}
								const dimensionsTotal = lor.ao_dimensions.reduce(
									(sum, d) => sum + d.marks,
									0,
								)
								expect(
									dimensionsTotal,
									`Q${q.question_number ?? "?"} ao_dimensions sum ${dimensionsTotal} should equal question total_marks ${q.total_marks}`,
								).toBe(q.total_marks)
							}
						} else if (method === "deterministic") {
							expect(
								q.mark_scheme.correct_option,
								`Q${q.question_number ?? "?"} deterministic has no correct_option`,
							).toBeTruthy()
						}
					}
				}

				// ── Section choice (either/or modelling) ────────────────────
				if (fixture.expected.sectionChoices) {
					for (const expected of fixture.expected.sectionChoices) {
						const needle = expected.titleContains.toLowerCase()
						const matched = bundle.sections.find((s) =>
							s.title.toLowerCase().includes(needle),
						)
						expect(
							matched,
							`no section title contains "${expected.titleContains}"`,
						).toBeTruthy()
						if (!matched) continue
						const choice = matched.choice ?? { kind: "all", n: null }
						expect(
							choice.kind,
							`section "${matched.title}" expected choice.kind=${expected.kind}, got ${choice.kind}`,
						).toBe(expected.kind)
						if (expected.kind === "any_n_of") {
							expect(
								choice.n,
								`section "${matched.title}" expected choice.n=${expected.n}, got ${choice.n}`,
							).toBe(expected.n)
						}
					}
				}

				// ── Paper total reconciles choice-aware ─────────────────────
				if (fixture.expected.expectedPrintedTotal !== undefined) {
					const sumChoiceAware = bundle.sections.reduce((acc, s) => {
						const choice = s.choice ?? { kind: "all", n: null }
						if (choice.kind === "any_n_of" && choice.n !== null) {
							const max = s.questions.reduce(
								(m, q) => Math.max(m, q.printed_marks ?? q.total_marks),
								0,
							)
							return acc + choice.n * max
						}
						return (
							acc +
							s.questions.reduce(
								(qacc, q) => qacc + (q.printed_marks ?? q.total_marks),
								0,
							)
						)
					}, 0)
					expect(
						sumChoiceAware,
						`choice-aware section sum (${sumChoiceAware}) must reconcile to paper printed total (${fixture.expected.expectedPrintedTotal})`,
					).toBe(fixture.expected.expectedPrintedTotal)
				}

				// ── Multi-skill LoR (parallel AO grids summed) ──────────────
				if (fixture.expected.lorMultiSkill) {
					for (const expected of fixture.expected.lorMultiSkill) {
						const question = bundle.sections
							.flatMap((s) => s.questions)
							.find((q) => q.question_number === expected.questionNumber)
						expect(
							question,
							`expected question ${expected.questionNumber} to be present`,
						).toBeTruthy()
						if (!question) continue
						expect(
							question.mark_scheme.marking_method,
							`Q${expected.questionNumber} should be level_of_response`,
						).toBe("level_of_response")
						const lor = question.mark_scheme.lor_extraction
						expect(
							lor,
							`Q${expected.questionNumber} missing lor_extraction`,
						).toBeTruthy()
						if (!lor) continue
						expect(
							lor.ao_dimensions.length,
							`Q${expected.questionNumber} expected ${expected.aoDimensions.length} dimensions, got ${lor.ao_dimensions.length}`,
						).toBe(expected.aoDimensions.length)
						for (const [idx, expectedDim] of expected.aoDimensions.entries()) {
							const actual = lor.ao_dimensions[idx]
							expect(
								actual?.ao_code,
								`Q${expected.questionNumber} dim[${idx}] expected ao_code ${expectedDim.ao_code}, got ${actual?.ao_code}`,
							).toBe(expectedDim.ao_code)
							expect(
								actual?.marks,
								`Q${expected.questionNumber} dim[${idx}] expected marks ${expectedDim.marks}, got ${actual?.marks}`,
							).toBe(expectedDim.marks)
						}
					}
				}

				// ── Stimulus extraction (only when fixture supplies one) ────
				if (fixture.expected.stimulus) {
					const allStimuli = bundle.sections.flatMap((s) => s.stimuli ?? [])
					expect(
						allStimuli.length,
						"expected at least one stimulus extracted from the insert pack",
					).toBeGreaterThanOrEqual(fixture.expected.stimulus.minTotal)

					const allContent = allStimuli.map((s) => s.content).join("\n\n")
					for (const needle of fixture.expected.stimulus.contentContains) {
						expect(
							allContent,
							`stimulus content missing required substring "${needle}"`,
						).toContain(needle)
					}

					// Round-trip: at least one question's stimulus_labels resolves
					// against a section-level stimulus label. This catches the
					// failure mode where stimulus content lands on the section but
					// nothing on the question side points at it.
					const labels = new Set(allStimuli.map((s) => s.label))
					const refs = bundle.sections.flatMap((s) =>
						s.questions.flatMap((q) => q.stimulus_labels ?? []),
					)
					const matched = refs.filter((r) => labels.has(r))
					expect(
						matched.length,
						"no question referenced a section-level stimulus via stimulus_labels",
					).toBeGreaterThanOrEqual(1)
				}
			},
			BUNDLE_TIMEOUT_MS + 30_000,
		)

		;(filesReady ? it : it.skip)(
			"printed paper total matches sum of section totals when both are populated",
			() => {
				if (!bundle) return
				const printedPaperTotal = bundle.metadata.printed_total_marks
				if (printedPaperTotal == null) return
				// Only run when EVERY section has its own printed total — a partial
				// set produces a false-positive mismatch. Some real papers print
				// only the paper-level total and skip section totals; that's a
				// "no signal" case, not a failure.
				const everySection = bundle.sections.every(
					(s) => s.printed_total_marks != null,
				)
				if (!everySection) return
				const sectionPrintedSum = bundle.sections.reduce(
					(acc, s) => acc + (s.printed_total_marks ?? 0),
					0,
				)
				expect(sectionPrintedSum).toBe(printedPaperTotal)
			},
		)
	})
}
