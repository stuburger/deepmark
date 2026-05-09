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
import { AHMED_ALI_MCQ_FIXTURE } from "./fixtures/attribution/ahmed-ali-mcq/fixture"
import { ARNAU_SINGH_MCQ_FIXTURE } from "./fixtures/attribution/arnau-singh-mcq/fixture"
import { JACK_KINNARD_MCQ_FIXTURE } from "./fixtures/attribution/jack-kinnard-mcq/fixture"
import { KAI_JASSI_FIXTURE } from "./fixtures/attribution/kai-jassi/fixture"
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
 * full extract path the production Lambda uses — per-page transcript pass +
 * whole-script attribution (which now also returns per-question MCQ letters
 * via the enum-constrained `mcq_answers` field) — and assert that each MCQ
 * question's final `answer_text` is the option letter only (`"C"`), never
 * the printed option text (`"Farming"`).
 *
 * Two fixtures: jack-kinnard-mcq (printed checkboxes — the original bug
 * shape) and kai-jassi (handwritten letters — different visual signal but
 * same letter-only output contract).
 *
 * No mocks — real Gemini, real attribution. Expensive, deliberately so.
 */

const FIXTURES: FixtureSpec[] = [
	JACK_KINNARD_MCQ_FIXTURE,
	AHMED_ALI_MCQ_FIXTURE,
	ARNAU_SINGH_MCQ_FIXTURE,
	KAI_JASSI_FIXTURE,
]

const PIPELINE_TIMEOUT_MS = 5 * 60_000

describe.each(FIXTURES)("MCQ extraction evals — $name", (fixture) => {
	const submissionId = `sub-mcq-eval-${fixture.name}-${Date.now()}`
	let answerTextByQuestionNumber: Map<string, string>

	beforeAll(async () => {
		const seeded = await seedFixture(fixture, submissionId)

		// Mirror the production extract handler: per-page transcript pass
		// (for `pageTranscripts`), then whole-script attribution. Attribution
		// owns MCQ extraction directly via its enum-constrained `mcq_answers`
		// field, projected into the returned `answer_text` for each MCQ.
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
				mcq_option_labels:
					q.question_type === "multiple_choice"
						? q.multiple_choice_options.map((o) => o.option_label)
						: undefined,
			}),
		)

		const { answers } = await attributeScript({
			jobId: submissionId,
			s3Bucket: Resource.ScansBucket.name,
			pages: seeded.pages,
			tokens: seeded.tokens,
			questions: attributeQuestions,
			pageTranscripts,
			llm,
		})

		const questionIdToNumber = new Map(
			fixture.questions.map((q) => [q.id, q.question_number]),
		)
		answerTextByQuestionNumber = new Map(
			answers.flatMap((a) => {
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
