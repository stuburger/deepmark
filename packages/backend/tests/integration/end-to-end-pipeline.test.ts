import * as fs from "node:fs"
import * as path from "node:path"
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs"
import { db, uploadTestFile } from "@mcp-gcse/test-utils"
import type { Node as PmNode } from "@tiptap/pm/model"
import { Resource } from "sst"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { HeadlessEditor } from "../../src/lib/collab/headless-editor"
import { KAI_JASSI_FIXTURE } from "./fixtures/attribution/kai-jassi/fixture"

/**
 * End-to-end pipeline test — pushes a real SQS message and observes the
 * collaborative doc as a real ProseMirror client.
 *
 * Architecture:
 *
 *   Test process                          AWS / sst dev process
 *   ────────────                          ─────────────────────
 *   HeadlessEditor (observer)  ◀────────  HeadlessEditor in OCR Lambda
 *           │     ySyncPlugin               (writer #1) — seeds skeleton,
 *           │     observes Y updates         fills answer text, applies
 *           │     and dispatches PM trs      ocrToken marks
 *           │
 *           │                              HeadlessEditor in grade Lambda
 *           │                               (writer #2) — applies AI
 *           │                               annotation marks per question
 *           │
 *           ▼
 *      observer.view.state.doc converges to the final shape
 *
 * The test:
 *   1. Seeds DB rows (exam paper, questions, mark schemes, submission) and
 *      uploads page images to S3.
 *   2. Opens a HeadlessEditor as the observer FIRST so it captures every
 *      remote update from the moment the Lambdas start.
 *   3. Pushes one SQS message to `StudentPaperOcrQueue` — same payload the
 *      `commitBatch` server action sends in production.
 *   4. Lets the live `sst dev` Lambdas process the chain (OCR → seeds skeleton
 *      / fills text → enqueues grade message → grade Lambda applies marks).
 *   5. Waits for the observer's PM doc to converge and settle.
 *   6. Asserts on the PM doc state only — no DB polling, no mocks.
 *
 * Run via:
 *
 *   AWS_PROFILE=deepmark bunx sst shell --stage=stuartbourhill -- \
 *     bunx vitest run --project=backend:integration \
 *       tests/integration/end-to-end-pipeline.test.ts
 *
 * Prerequisites:
 *   - `sst dev` running in another terminal (the OCR + grade Lambda
 *     subscribers and the local Hocuspocus server must be live).
 *   - Reachable Hocuspocus on the stage's collab URL.
 */

const FIXTURE = KAI_JASSI_FIXTURE
const SUBMISSION_ID = `e2e-${FIXTURE.name}-${Date.now()}`
const PIPELINE_TIMEOUT_MS = 2 * 60_000
const SETTLE_MS = 10_000
const POLL_INTERVAL_MS = 1_000

const sqs = new SQSClient({})

async function seedExamPaperAndQuestions(): Promise<void> {
	await db.user.upsert({
		where: { id: FIXTURE.userId },
		create: {
			id: FIXTURE.userId,
			email: `e2e+${FIXTURE.name}@deepmark.test`,
			name: `E2E fixture: ${FIXTURE.name}`,
			role: "teacher",
			is_active: true,
		},
		update: {},
	})

	const totalMarks = FIXTURE.questions.reduce((s, q) => s + q.points, 0)
	await db.examPaper.upsert({
		where: { id: FIXTURE.examPaperId },
		create: {
			id: FIXTURE.examPaperId,
			title: `E2E fixture — ${FIXTURE.name}`,
			subject: "business",
			exam_board: "AQA",
			year: 2026,
			total_marks: totalMarks,
			duration_minutes: 60,
			is_active: true,
			is_public: false,
			created_by_id: FIXTURE.userId,
		},
		update: {},
	})

	await db.examSection.upsert({
		where: { id: FIXTURE.sectionId },
		create: {
			id: FIXTURE.sectionId,
			exam_paper_id: FIXTURE.examPaperId,
			title: "Section 1",
			total_marks: totalMarks,
			order: 1,
			created_by_id: FIXTURE.userId,
		},
		update: {},
	})

	for (const [i, q] of FIXTURE.questions.entries()) {
		await db.question.upsert({
			where: { id: q.id },
			create: {
				id: q.id,
				text: q.text,
				topic: "business",
				question_type: q.question_type,
				question_number: q.question_number,
				points: q.points,
				multiple_choice_options: q.multiple_choice_options,
				origin: "question_paper",
				subject: "business",
				created_by_id: FIXTURE.userId,
			},
			update: {},
		})

		await db.examSectionQuestion.upsert({
			where: { id: `${FIXTURE.sectionId}-esq-${q.question_number}` },
			create: {
				id: `${FIXTURE.sectionId}-esq-${q.question_number}`,
				exam_section_id: FIXTURE.sectionId,
				question_id: q.id,
				order: i + 1,
			},
			update: {},
		})

		const existing = await db.markScheme.findFirst({
			where: { question_id: q.id },
		})
		if (existing) continue

		// Minimal mark schemes — exact-correctness doesn't matter for this
		// test (we assert pipeline shape, not grading accuracy).
		if (q.question_type === "multiple_choice") {
			await db.markScheme.create({
				data: {
					question_id: q.id,
					description: "1 mark for correct answer",
					guidance: "",
					points_total: q.points,
					mark_points: [
						{
							points: q.points,
							criteria: "Correct option selected",
							description: "Correct answer",
							point_number: 1,
						},
					],
					correct_option_labels: [
						q.multiple_choice_options[0]?.option_label ?? "A",
					],
					marking_method: "deterministic",
					created_by_id: FIXTURE.userId,
				},
			})
		} else {
			await db.markScheme.create({
				data: {
					question_id: q.id,
					description: `Award up to ${q.points} marks for valid points`,
					guidance: "Accept any reasonable answer that addresses the question.",
					points_total: q.points,
					mark_points: Array.from({ length: q.points }).map((_, idx) => ({
						points: 1,
						criteria: "Award 1 mark for any reasonable point",
						description: `Mark point ${idx + 1}`,
						point_number: idx + 1,
					})),
					correct_option_labels: [],
					marking_method: "point_based",
					created_by_id: FIXTURE.userId,
				},
			})
		}
	}
}

async function seedSubmission(): Promise<void> {
	const pageKeys: Array<{ key: string; order: number; mime_type: string }> = []
	for (const page of FIXTURE.pages) {
		const key = `test/end-to-end/${FIXTURE.name}/${SUBMISSION_ID}/${page.image_filename}`
		const bytes = fs.readFileSync(path.join(FIXTURE.dir, page.image_filename))
		await uploadTestFile(key, bytes, page.mime_type)
		pageKeys.push({ key, order: page.order, mime_type: page.mime_type })
	}

	await db.studentSubmission.create({
		data: {
			id: SUBMISSION_ID,
			exam_paper_id: FIXTURE.examPaperId,
			uploaded_by: FIXTURE.userId,
			s3_key: pageKeys[0]?.key ?? "",
			s3_bucket: Resource.ScansBucket.name,
			exam_board: "AQA",
			subject: "business",
			year: 2026,
			pages: pageKeys,
		},
	})
}

async function cleanup(): Promise<void> {
	await db.studentPaperAnnotation
		.deleteMany({ where: { submission_id: SUBMISSION_ID } })
		.catch(() => {})
	await db.studentPaperAnswerRegion
		.deleteMany({ where: { submission_id: SUBMISSION_ID } })
		.catch(() => {})
	await db.studentPaperPageToken
		.deleteMany({ where: { submission_id: SUBMISSION_ID } })
		.catch(() => {})
	await db.gradingRun
		.deleteMany({ where: { submission_id: SUBMISSION_ID } })
		.catch(() => {})
	await db.ocrRun
		.deleteMany({ where: { submission_id: SUBMISSION_ID } })
		.catch(() => {})
	await db.studentSubmission
		.deleteMany({ where: { id: SUBMISSION_ID } })
		.catch(() => {})
}

// ─── PM doc inspection helpers ────────────────────────────────────────────

type QuestionBlockSummary = {
	questionId: string
	awardedScore: number | null
	textLength: number
	annotationMarkCount: number
	ocrTokenMarkCount: number
}

const ANNOTATION_MARK_NAMES = new Set([
	"tick",
	"cross",
	"annotationUnderline",
	"doubleUnderline",
	"box",
	"circle",
	"chain",
])

function summariseDoc(doc: PmNode): QuestionBlockSummary[] {
	const out: QuestionBlockSummary[] = []
	doc.descendants((node) => {
		if (node.type.name === "mcqTable") {
			// MCQs live as rows inside the table's `results` attr — flatten
			// them out so the test sees one summary entry per MCQ question.
			const rows =
				(node.attrs.results as Array<{
					questionId: string
					awardedScore: number | null
					studentAnswer: string | null
				}>) ?? []
			for (const r of rows) {
				out.push({
					questionId: r.questionId,
					awardedScore: r.awardedScore,
					textLength: r.studentAnswer?.length ?? 0,
					annotationMarkCount: 0,
					ocrTokenMarkCount: 0,
				})
			}
			return false
		}
		if (node.type.name !== "questionAnswer") return true
		const text = node.textContent
		let annotationMarks = 0
		let ocrTokens = 0
		node.descendants((child) => {
			for (const m of child.marks) {
				if (ANNOTATION_MARK_NAMES.has(m.type.name)) annotationMarks++
				else if (m.type.name === "ocrToken") ocrTokens++
			}
			return true
		})
		out.push({
			questionId: (node.attrs.questionId as string) ?? "",
			awardedScore: (node.attrs.awardedScore as number | null) ?? null,
			textLength: text.length,
			annotationMarkCount: annotationMarks,
			ocrTokenMarkCount: ocrTokens,
		})
		return false
	})
	return out
}

// ─── Test ─────────────────────────────────────────────────────────────────

describe("End-to-end live pipeline (real SQS, real Lambdas, real Hocuspocus)", () => {
	let observer: HeadlessEditor

	beforeAll(async () => {
		// `sst shell` doesn't inject STAGE — the Lambdas get it via
		// `environment: { STAGE: $app.stage }` in infra/queues.ts. The test
		// process needs to match so observer + writer agree on the doc name
		// (`${STAGE}:submission:${id}`). Parse it from any deployed queue URL
		// (format: `<app>-<stage>-<resource>...`).
		const queueUrl = Resource.StudentPaperOcrQueue.url
		const stage = queueUrl.match(/-([a-zA-Z0-9]+)-StudentPaperOcrQueue/)?.[1]
		if (!stage) {
			throw new Error(`Could not parse stage from queue URL: ${queueUrl}`)
		}
		process.env.STAGE = stage

		await seedExamPaperAndQuestions()
		await seedSubmission()
		// Observer connects BEFORE the SQS message goes out so we capture
		// every Y update from the moment the OCR Lambda starts writing.
		observer = await HeadlessEditor.open({ submissionId: SUBMISSION_ID })
	}, 60_000)

	afterAll(async () => {
		try {
			observer?.close()
		} catch {}
		await cleanup()
	}, 30_000)

	it(
		"OCR + grade Lambdas converge the doc to the expected shape",
		async () => {
			// Track Y update timestamps — used as a "doc has settled" signal.
			let lastUpdateMs = Date.now()
			observer.doc.on("update", () => {
				lastUpdateMs = Date.now()
			})

			// ── Push real SQS message ─────────────────────────────────────
			// Same payload `commitBatch` sends in production. From here on the
			// pipeline runs entirely outside our process.
			await sqs.send(
				new SendMessageCommand({
					QueueUrl: Resource.StudentPaperOcrQueue.url,
					MessageBody: JSON.stringify({ job_id: SUBMISSION_ID }),
				}),
			)

			// ── Wait for convergence ──────────────────────────────────────
			// Convergence criteria, observed entirely through the PM doc:
			//   1. One questionAnswer block per fixture question (skeleton seed
			//      done — single atomic Yjs update from `dispatchExtractedDoc`).
			//   2. At least one block has non-empty answer text (OCR reached us).
			//   3. Every block has `awardedScore` set (grade Lambda dispatched
			//      `setQuestionScore` per question — the score is part of the
			//      doc, not a parallel annotation row).
			//   4. SETTLE_MS elapsed since the last Y update (no in-flight
			//      writes).
			// Reserve 10s of the it() budget so assertions get a chance to run
			// even when convergence times out. Otherwise vitest kills the test
			// at exactly PIPELINE_TIMEOUT_MS and we get "Test timed out"
			// instead of a clear assertion message.
			const deadline = Date.now() + (PIPELINE_TIMEOUT_MS - 10_000)
			let lastSummary: QuestionBlockSummary[] = []
			let lastLog = ""
			while (Date.now() < deadline) {
				const summary = summariseDoc(observer.view.state.doc)
				lastSummary = summary

				const expectedBlocks = FIXTURE.questions.length
				const haveAllBlocks = summary.length === expectedBlocks
				const haveText = summary.some((s) => s.textLength > 0)
				const allScored = summary.every((s) => s.awardedScore !== null)
				const settled = Date.now() - lastUpdateMs >= SETTLE_MS

				const scored = summary.filter((s) => s.awardedScore !== null).length
				const log = `blocks=${summary.length}/${expectedBlocks} withText=${summary.filter((s) => s.textLength > 0).length} scored=${scored}/${expectedBlocks} marks=${summary.reduce((a, b) => a + b.annotationMarkCount, 0)} settledFor=${Math.floor((Date.now() - lastUpdateMs) / 1000)}s`
				if (log !== lastLog) {
					console.log(`[e2e] ${log}`)
					lastLog = log
				}

				// Early exit when the doc has already gone wrong — no point
				// waiting for the rest of the pipeline if the skeleton is
				// already duplicated.
				if (summary.length > expectedBlocks && settled) {
					console.log(
						`[e2e] EARLY-EXIT: ${summary.length} blocks vs ${expectedBlocks} expected — concurrent OCR Lambdas raced`,
					)
					break
				}

				if (haveAllBlocks && haveText && allScored && settled) break

				await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
			}

			console.log(
				"[e2e] FINAL doc summary:",
				JSON.stringify(lastSummary, null, 2),
			)

			// ── Assertions on the converged PM doc ────────────────────────
			expect(
				lastSummary.length,
				`expected ${FIXTURE.questions.length} questionAnswer blocks, got ${lastSummary.length}`,
			).toBe(FIXTURE.questions.length)

			const ids = lastSummary.map((s) => s.questionId)
			expect(
				new Set(ids).size,
				"every questionAnswer block must have a unique questionId — duplicates indicate concurrent OCR runs racing on insertQuestionBlock",
			).toBe(lastSummary.length)

			const blocksWithText = lastSummary.filter((s) => s.textLength > 0)
			expect(
				blocksWithText.length,
				"at least one question must have non-empty answer text (OCR reached the doc)",
			).toBeGreaterThan(0)

			const blocksWithScore = lastSummary.filter((s) => s.awardedScore !== null)
			expect(
				blocksWithScore.length,
				"every question must have `awardedScore` set on its block (grade Lambda dispatched setQuestionScore)",
			).toBe(FIXTURE.questions.length)

			// Token-anchored annotation marks (LoR underlines, AO chains, etc.)
			// only fire for `level_of_response` questions — this fixture is all
			// MCQ + point-based, so we don't assert on `annotationMarkCount`.
			// `awardedScore` carries the grade signal for every other question
			// type. See `docs/build-plan-doc-as-source-of-truth.md`.
			const totalAnnotationMarks = lastSummary.reduce(
				(s, b) => s + b.annotationMarkCount,
				0,
			)
			expect(
				totalAnnotationMarks,
				"kai-jassi fixture is all MCQ + point-based: zero token-anchored marks expected. Swap in a fixture with `level_of_response` questions to exercise the LLM annotation path.",
			).toBe(0)
		},
		PIPELINE_TIMEOUT_MS,
	)
})
