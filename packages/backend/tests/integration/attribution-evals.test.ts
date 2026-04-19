import { db } from "@mcp-gcse/test-utils"
import { Resource } from "sst"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { normalizeQuestionNumber } from "../../src/lib/grading/normalize-question-number"
import { createLlmRunner } from "../../src/lib/infra/llm-runtime"
import {
	type AttributeScriptQuestion,
	attributeScript,
} from "../../src/lib/scan-extraction/attribute-script"
import { sortTokensSpatially } from "@mcp-gcse/shared"
import { AARON_BROWN_FIXTURE } from "./fixtures/attribution/aaron-brown/fixture"
import { KAI_JASSI_FIXTURE } from "./fixtures/attribution/kai-jassi/fixture"
import {
	cleanupSubmission,
	seedFixture,
} from "./fixtures/attribution/load-fixture"
import type { FixtureSpec } from "./fixtures/attribution/shared-types"

/**
 * End-to-end evals for the script-level attribution pipeline.
 *
 * These are NOT mocked — each fixture runs `attributeScript(...)` against the
 * real LLM with real page images and real Cloud Vision tokens pulled from
 * production (Aaron Brown) and the stuartbourhill dev stage (Kai Jassi).
 *
 * Each eval targets a specific failure mode that the current per-page
 * attribution flow exhibits. They serve as a regression gate AND as a
 * behavioural contract for the new pipeline:
 *
 *  - Eval 1: multi-page continuation must not lose continuation pages.
 *  - Eval 2: per page, each question's attributed tokens must form a single
 *    contiguous spatial run — no interleaving between questions.
 *  - Eval 3: non-answer pages (covers, templates) must attract zero
 *    attribution.
 *  - Eval 4: dense multi-answer pages must distribute tokens across each
 *    answer — no silent collapse into a single dominant region.
 *
 * `attributeScript` is intentionally a stub today; every eval in this file
 * fails at `beforeAll` with "not yet implemented". Implementing the pipeline
 * is what turns them green.
 */

const FIXTURES: FixtureSpec[] = [AARON_BROWN_FIXTURE, KAI_JASSI_FIXTURE]

const ATTRIBUTION_TIMEOUT_MS = 5 * 60_000

describe.each(FIXTURES)("script-level attribution evals — $name", (fixture) => {
	const submissionId = `sub-eval-${fixture.name}-${Date.now()}`
	let questionIdByNumber: Map<string, string>
	let answersByQuestionId: Map<string, string>

	beforeAll(async () => {
		const seeded = await seedFixture(fixture, submissionId)

		const attributeQuestions: AttributeScriptQuestion[] = fixture.questions.map(
			(q) => ({
				question_id: q.id,
				question_number: q.question_number,
				question_text: q.text,
				is_mcq: q.question_type === "multiple_choice",
			}),
		)

		const llm = createLlmRunner()

		const result = await attributeScript({
			jobId: submissionId,
			s3Bucket: Resource.ScansBucket.name,
			pages: seeded.pages,
			tokens: seeded.tokens,
			questions: attributeQuestions,
			llm,
		})

		answersByQuestionId = new Map(
			result.answers.map((a) => [a.question_id, a.answer_text]),
		)

		questionIdByNumber = new Map(
			fixture.questions.map((q) => [
				normalizeQuestionNumber(q.question_number),
				q.id,
			]),
		)
	}, ATTRIBUTION_TIMEOUT_MS)

	afterAll(async () => {
		await cleanupSubmission(submissionId).catch(() => {})
	})

	// ── Eval 1 — continuation coverage ─────────────────────────────────────
	it.skipIf(!fixture.expectations.continuation)(
		"Eval 1 — continuation answer reaches every page it spans",
		async () => {
			const spec = fixture.expectations.continuation
			if (!spec) throw new Error("guarded by skipIf")

			const targetId = questionIdByNumber.get(
				normalizeQuestionNumber(spec.questionNumber),
			)
			expect(
				targetId,
				`question_number ${spec.questionNumber} present`,
			).toBeDefined()

			for (const pageSpec of spec.pages) {
				const tokens = await db.studentPaperPageToken.findMany({
					where: { submission_id: submissionId, page_order: pageSpec.page },
					select: { question_id: true },
				})

				const attributedToTarget = tokens.filter(
					(t) => t.question_id === targetId,
				).length
				const coverage =
					tokens.length > 0 ? attributedToTarget / tokens.length : 0

				if (pageSpec.minTokens !== undefined) {
					expect(
						attributedToTarget,
						`page ${pageSpec.page}: Q${spec.questionNumber} must have ≥${pageSpec.minTokens} tokens (got ${attributedToTarget})`,
					).toBeGreaterThanOrEqual(pageSpec.minTokens)
				}
				if (pageSpec.minCoverage !== undefined) {
					expect(
						coverage,
						`page ${pageSpec.page}: Q${spec.questionNumber} coverage was ${(coverage * 100).toFixed(1)}% (${attributedToTarget}/${tokens.length}); required ≥${pageSpec.minCoverage * 100}%`,
					).toBeGreaterThanOrEqual(pageSpec.minCoverage)
				}
			}
		},
	)

	// ── Eval 2 — no interleaving of questions per page ─────────────────────
	it("Eval 2 — per page, each question's tokens form a single contiguous spatial run", async () => {
		for (const page of fixture.pages) {
			const tokens = await db.studentPaperPageToken.findMany({
				where: {
					submission_id: submissionId,
					page_order: page.order,
					question_id: { not: null },
				},
				select: {
					id: true,
					para_index: true,
					line_index: true,
					word_index: true,
					bbox: true,
					question_id: true,
				},
			})
			if (tokens.length === 0) continue

			const sorted = sortTokensSpatially(tokens)

			// Walk the sequence of question_ids in reading order. Each distinct
			// id may only appear in ONE contiguous run — seeing it again after
			// a switch means two questions' tokens are interleaved, which is
			// the overlap failure mode that killed the old answer-regions
			// approach.
			const finishedRuns = new Set<string>()
			let current: string | null = null
			for (const t of sorted) {
				const qid = t.question_id
				if (qid === current) continue
				if (qid && finishedRuns.has(qid)) {
					throw new Error(
						`Interleaving detected on page ${page.order}: question ${qid} reappears after another question's tokens. Tokens on this page are not cleanly separated by question.`,
					)
				}
				if (current) finishedRuns.add(current)
				current = qid
			}
		}
	})

	// ── Eval 3 — no spurious attribution on non-answer pages ───────────────
	it.skipIf(!fixture.expectations.nonAnswerPages?.length)(
		"Eval 3 — cover/template pages attract zero attribution",
		async () => {
			const nonAnswerPages = fixture.expectations.nonAnswerPages ?? []
			for (const pageOrder of nonAnswerPages) {
				const attributed = await db.studentPaperPageToken.count({
					where: {
						submission_id: submissionId,
						page_order: pageOrder,
						question_id: { not: null },
					},
				})
				expect(
					attributed,
					`page ${pageOrder} is a non-answer page (cover/template) and must not receive any attribution — got ${attributed} attributed tokens`,
				).toBe(0)
			}
		},
	)

	// ── Eval 4 — boundary correctness on dense multi-answer pages ──────────
	it.skipIf(!fixture.expectations.densePages?.length)(
		"Eval 4 — each answer on a dense page receives a non-trivial share of tokens",
		async () => {
			const densePages = fixture.expectations.densePages ?? []
			for (const spec of densePages) {
				for (const qNumber of spec.mustHaveNonTrivial) {
					const qid = questionIdByNumber.get(normalizeQuestionNumber(qNumber))
					expect(qid, `question_number ${qNumber} present`).toBeDefined()

					const count = await db.studentPaperPageToken.count({
						where: {
							submission_id: submissionId,
							page_order: spec.page,
							question_id: qid,
						},
					})

					expect(
						count,
						`page ${spec.page}: Q${qNumber} must receive ≥${spec.minTokensPerAnswer} tokens (got ${count}). If this is 0 or very small, the attribution likely collapsed adjacent answers into one region.`,
					).toBeGreaterThanOrEqual(spec.minTokensPerAnswer)
				}
			}
		},
	)

	// ── Eval 5 — answer_text populated for every attributed question ───────
	// Any question that has ≥1 attributed token in the DB must also have a
	// non-empty answer_text in attribution's return. Catches the regression
	// where tokens get a question_id but the LLM forgets to author
	// answer_text — grading would see an empty string and skip the question.
	it("Eval 5 — every question with attributed tokens has non-empty answer_text", async () => {
		const attributed = await db.studentPaperPageToken.findMany({
			where: { submission_id: submissionId, question_id: { not: null } },
			select: { question_id: true },
			distinct: ["question_id"],
		})

		const missingText: string[] = []
		for (const row of attributed) {
			if (!row.question_id) continue
			const text = answersByQuestionId.get(row.question_id) ?? ""
			if (text.trim().length === 0) {
				missingText.push(row.question_id)
			}
		}
		expect(
			missingText,
			`${missingText.length} attributed question(s) produced no answer_text: [${missingText.join(", ")}]. Attribution must return answer_text whenever it assigns tokens.`,
		).toEqual([])
	})

	// ── Eval 6 — punctuation preservation in answer_text ───────────────────
	// Cloud Vision word tokenisation drops standalone marks ("-", "=", "+")
	// with discouraging frequency. The attribution LLM is the authoritative
	// source for answer_text and must read these directly from the image /
	// transcript. This eval asserts the required substrings appear verbatim
	// in the LLM-authored text.
	it.skipIf(!fixture.expectations.answerTextMustContain?.length)(
		"Eval 6 — answer_text preserves required punctuation/substrings",
		async () => {
			const specs = fixture.expectations.answerTextMustContain ?? []
			for (const spec of specs) {
				const qid = questionIdByNumber.get(
					normalizeQuestionNumber(spec.questionNumber),
				)
				expect(
					qid,
					`question_number ${spec.questionNumber} present`,
				).toBeDefined()
				if (!qid) continue

				const text = answersByQuestionId.get(qid) ?? ""
				const missing = spec.substrings.filter((s) => !text.includes(s))
				expect(
					missing,
					`Q${spec.questionNumber} answer_text missing substrings [${missing.map((s) => JSON.stringify(s)).join(", ")}] — got: ${JSON.stringify(text)}`,
				).toEqual([])
			}
		},
	)
})
