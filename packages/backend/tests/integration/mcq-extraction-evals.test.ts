import * as fs from "node:fs"
import * as path from "node:path"
import { Resource } from "sst"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createLlmRunner } from "../../src/lib/infra/llm-runtime"
import {
	type AttributeScriptQuestion,
	attributeScript,
} from "../../src/lib/scan-extraction/attribute-script"
import { runOcr } from "../../src/lib/scan-extraction/gemini-ocr"
import { resolveMcqAnswers } from "../../src/lib/scan-extraction/resolve-mcq-answers"
import type { QuestionSeed } from "../../src/lib/types"
import { JACK_KINNARD_MCQ_FIXTURE } from "./fixtures/attribution/jack-kinnard-mcq/fixture"
import {
	cleanupSubmission,
	seedFixture,
} from "./fixtures/attribution/load-fixture"
import type { FixtureSpec } from "./fixtures/attribution/shared-types"

/**
 * End-to-end evals for MCQ answer extraction.
 *
 * Different concern from `attribution-evals.test.ts`. Those evals call
 * `attributeScript` directly and check token-level attribution. These run the
 * FULL extract path used by the production Lambda — per-page Gemini OCR +
 * attribution + `resolveMcqAnswers` — and assert that each MCQ question's
 * final `answer_text` is the option letter only (`"C"`), never the printed
 * option text (`"Farming"`) or the letter glued to prose
 * (`"D Allows the customisation of products"`).
 *
 * Scope today: a single fixture (Jack Kinnard, AQA Business, page 2). Reproduces
 * the printed-checkbox failure mode where the per-page Gemini call misses the
 * tick and attribution leaks the printed option text.
 *
 * No mocks — real Gemini, real attribution. Expensive, deliberately so.
 */

const FIXTURES: FixtureSpec[] = [JACK_KINNARD_MCQ_FIXTURE]

const PIPELINE_TIMEOUT_MS = 5 * 60_000

describe.each(FIXTURES)("MCQ extraction evals — $name", (fixture) => {
	const submissionId = `sub-mcq-eval-${fixture.name}-${Date.now()}`
	let answerTextByQuestionNumber: Map<string, string>

	beforeAll(async () => {
		const seeded = await seedFixture(fixture, submissionId)

		// Mirror the production extract handler: per-page Gemini OCR in
		// parallel, then whole-script attribution, then MCQ resolution.
		const llm = createLlmRunner()

		const sortedPages = [...fixture.pages].sort((a, b) => a.order - b.order)

		const pageOcrResults = await Promise.all(
			sortedPages.map((page, i) => {
				const filePath = path.join(fixture.dir, page.image_filename)
				const imageBase64 = fs.readFileSync(filePath).toString("base64")
				return runOcr(
					imageBase64,
					page.mime_type,
					{ extractMetadata: i === 0 },
					llm,
				)
			}),
		)

		const pageTranscripts = new Map(
			sortedPages.map((page, i) => [
				page.order,
				pageOcrResults[i]?.transcript ?? "",
			]),
		)

		const attributeQuestions: AttributeScriptQuestion[] = fixture.questions.map(
			(q) => ({
				question_id: q.id,
				question_number: q.question_number,
				question_text: q.text,
				is_mcq: q.question_type === "multiple_choice",
			}),
		)

		const { answers: baseAnswers } = await attributeScript({
			jobId: submissionId,
			s3Bucket: Resource.ScansBucket.name,
			pages: seeded.pages,
			tokens: seeded.tokens,
			questions: attributeQuestions,
			pageTranscripts,
			llm,
		})

		const questionSeeds: QuestionSeed[] = fixture.questions.map((q) => ({
			question_id: q.id,
			question_number: q.question_number,
			question_text: q.text,
			question_type: q.question_type,
			max_score: q.points,
			multiple_choice_options: q.multiple_choice_options,
		}))

		const reconstructed = resolveMcqAnswers({
			baseAnswers,
			ocrSelectionsByPage: pageOcrResults.map((r) => r.mcqSelections),
			questionSeeds,
		})

		const questionIdToNumber = new Map(
			fixture.questions.map((q) => [q.id, q.question_number]),
		)
		answerTextByQuestionNumber = new Map(
			reconstructed.flatMap((a) => {
				const num = questionIdToNumber.get(a.question_id)
				return num ? [[num, a.answer_text]] : []
			}),
		)
	}, PIPELINE_TIMEOUT_MS)

	afterAll(async () => {
		await cleanupSubmission(submissionId).catch(() => {})
	})

	// ── Eval 7 — MCQ answer_text is the expected letter exactly ────────────
	it.skipIf(!fixture.expectations.expectedMcqAnswers?.length)(
		"Eval 7 — every MCQ resolves to the expected option letter exactly",
		() => {
			const specs = fixture.expectations.expectedMcqAnswers ?? []
			const failures: string[] = []
			for (const spec of specs) {
				const got = answerTextByQuestionNumber.get(spec.questionNumber) ?? ""
				if (got !== spec.expectedLetter) {
					failures.push(
						`Q${spec.questionNumber}: expected ${JSON.stringify(spec.expectedLetter)}, got ${JSON.stringify(got)}`,
					)
				}
			}
			expect(
				failures,
				`MCQ extraction must produce letter-only answers. Failures:\n  ${failures.join("\n  ")}`,
			).toEqual([])
		},
	)

	// ── Eval 8 — MCQ answer_text is short ──────────────────────────────────
	// Catches the "letter + printed option text" leak shape ("D Allows the
	// customisation of products") even when the letter happens to be the
	// student's actual choice. A clean MCQ answer is at most a handful of
	// letters (single + multi-select); anything longer is contamination.
	it.skipIf(!fixture.expectations.expectedMcqAnswers?.length)(
		"Eval 8 — MCQ answer_text contains no prose (≤5 chars, letters only)",
		() => {
			const specs = fixture.expectations.expectedMcqAnswers ?? []
			const failures: string[] = []
			for (const spec of specs) {
				const got = answerTextByQuestionNumber.get(spec.questionNumber) ?? ""
				if (got.length > 5 || !/^[A-Z]*$/.test(got)) {
					failures.push(
						`Q${spec.questionNumber}: answer_text ${JSON.stringify(got)} is not letters-only`,
					)
				}
			}
			expect(
				failures,
				`MCQ answer_text must be letters only, no prose:\n  ${failures.join("\n  ")}`,
			).toEqual([])
		},
	)
})
