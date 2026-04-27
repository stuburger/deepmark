/**
 * One-shot migration: for every legacy submission whose Y.Doc snapshot is
 * missing in S3, build an equivalent Y.Doc from SQL (questions, OCR answers,
 * tokens, annotations) and write the encoded update to
 * `s3://<scansBucket>/yjs/${stage}:submission:${submissionId}.bin`.
 *
 * Run via SST shell so `Resource.*` and `STAGE` are populated:
 *
 *   AWS_PROFILE=deepmark bunx sst shell --stage=stuartbourhill -- \
 *     bun packages/backend/scripts/migrate-yjs-snapshots.ts [flags]
 *
 * Flags:
 *   --limit N             cap iterations (smoke testing)
 *   --submission-id ID    process exactly one submission
 *   --exam-paper-id ID    process every (non-superseded, completed-grading)
 *                         submission belonging to this exam paper
 *   --include-superseded  also migrate superseded versions of submissions
 *                         (off by default — superseded rows are normally
 *                         hidden from the UI, but their docs may still be
 *                         opened directly via deep links / version nav)
 *   --dry-run             build doc but skip the S3 PUT
 *   --force               overwrite an existing snapshot (off by default)
 *
 * The Y.Doc is built locally — no Hocuspocus connection. createHeadlessView
 * binds a real PM EditorView to a bare Y.Doc and ySyncPlugin observes each
 * dispatch, so we can call the same dispatchExtractedDocOps + applyAnnotationMark
 * the live pipeline uses, then encode the resulting state to bytes and PUT to S3.
 */

import { db } from "@/db"
import {
	type PerQuestionAnswer,
	type QuestionSkeleton,
	dispatchExtractedDocOps,
} from "@/lib/collab/editor-seed"
import { createHeadlessView } from "@/lib/collab/headless-editor"
import { loadTokensByQuestion } from "@/lib/collab/load-tokens"
import {
	HeadObjectCommand,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3"
import {
	type AnnotationMarkSpec,
	type AnnotationSignal,
	type QuestionGradeAttrs,
	alignTokensToAnswer,
	applyAnnotationMark,
	buildSubmissionDocumentName,
	isMarkSignal,
	setQuestionGrade,
} from "@mcp-gcse/shared"
import { Resource } from "sst"
import * as Y from "yjs"

// ─── Args ───────────────────────────────────────────────────────────────────

type Flags = {
	limit?: number
	submissionId?: string
	examPaperId?: string
	includeSuperseded: boolean
	dryRun: boolean
	force: boolean
}

function parseFlags(argv: string[]): Flags {
	let limit: number | undefined
	let submissionId: string | undefined
	let examPaperId: string | undefined
	let includeSuperseded = false
	let dryRun = false
	let force = false
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i]
		if (a === "--limit") {
			const next = argv[++i]
			limit = Number(next)
			if (Number.isNaN(limit)) {
				throw new Error(`--limit requires a number, got ${JSON.stringify(next)}`)
			}
		} else if (a === "--submission-id") {
			submissionId = argv[++i]
		} else if (a === "--exam-paper-id") {
			examPaperId = argv[++i]
		} else if (a === "--include-superseded") {
			includeSuperseded = true
		} else if (a === "--dry-run") {
			dryRun = true
		} else if (a === "--force") {
			force = true
		} else {
			throw new Error(`Unknown flag: ${a}`)
		}
	}
	if (submissionId && examPaperId) {
		throw new Error("--submission-id and --exam-paper-id are mutually exclusive")
	}
	return { limit, submissionId, examPaperId, includeSuperseded, dryRun, force }
}

const flags = parseFlags(process.argv.slice(2))

// `Resource.App.stage` is populated by `sst shell`. Lambdas read STAGE from
// process.env (set in infra/queues.ts), but for a local CLI we go via the
// SST resource so the script can't be run outside an `sst shell` context.
const STAGE = Resource.App.stage

// ─── S3 ─────────────────────────────────────────────────────────────────────

const s3 = new S3Client({})
const bucket = Resource.ScansBucket.name

function keyFor(documentName: string): string {
	return `yjs/${documentName}.bin`
}

async function snapshotExists(documentName: string): Promise<boolean> {
	try {
		await s3.send(
			new HeadObjectCommand({ Bucket: bucket, Key: keyFor(documentName) }),
		)
		return true
	} catch (err) {
		const name = (err as { name?: string }).name
		const status = (err as { $metadata?: { httpStatusCode?: number } })
			.$metadata?.httpStatusCode
		if (name === "NotFound" || name === "NoSuchKey" || status === 404) {
			return false
		}
		throw err
	}
}

async function putSnapshot(
	documentName: string,
	bytes: Uint8Array,
): Promise<void> {
	await s3.send(
		new PutObjectCommand({
			Bucket: bucket,
			Key: keyFor(documentName),
			Body: bytes,
			ContentType: "application/octet-stream",
		}),
	)
}

// ─── DB queries ─────────────────────────────────────────────────────────────

async function loadSubmissions() {
	if (flags.submissionId) {
		const row = await db.studentSubmission.findUnique({
			where: { id: flags.submissionId },
			select: { id: true, exam_paper_id: true },
		})
		return row ? [row] : []
	}
	return db.studentSubmission.findMany({
		where: {
			...(flags.includeSuperseded ? {} : { superseded_at: null }),
			grading_runs: { some: { status: "complete" } },
			...(flags.examPaperId ? { exam_paper_id: flags.examPaperId } : {}),
		},
		take: flags.limit,
		orderBy: { created_at: "asc" },
		select: { id: true, exam_paper_id: true },
	})
}

async function loadQuestionSkeletons(
	examPaperId: string,
): Promise<QuestionSkeleton[]> {
	const sections = await db.examSection.findMany({
		where: { exam_paper_id: examPaperId },
		orderBy: { order: "asc" },
		select: {
			exam_section_questions: {
				orderBy: { order: "asc" },
				select: {
					question: {
						select: {
							id: true,
							question_number: true,
							text: true,
							points: true,
							question_type: true,
							multiple_choice_options: true,
							mark_schemes: {
								where: { link_status: { not: "unlinked" } },
								take: 1,
								select: { correct_option_labels: true },
							},
						},
					},
				},
			},
		},
	})

	const skeletons: QuestionSkeleton[] = []
	for (const section of sections) {
		for (const esq of section.exam_section_questions) {
			const q = esq.question
			const isMcq = q.question_type === "multiple_choice"
			const options = isMcq
				? (q.multiple_choice_options as Array<{
						option_label: string
						option_text: string
					}>)
				: []
			const correctLabels = isMcq
				? (q.mark_schemes[0]?.correct_option_labels ?? [])
				: []
			skeletons.push({
				questionId: q.id,
				questionNumber: q.question_number ?? "",
				questionText: q.text || null,
				maxScore: q.points ?? null,
				questionType: q.question_type,
				options,
				correctLabels,
			})
		}
	}
	return skeletons
}

// Stored shape: { student_name?, answers: [{question_id, answer_text}] }.
// (The schema comment in db/prisma/schema.prisma still says `question_number`
// — that's stale; OCR has been writing `question_id` for a while.)
type ExtractedAnswer = { question_id: string; answer_text: string }

async function loadExtractedAnswers(
	submissionId: string,
): Promise<ExtractedAnswer[]> {
	// Don't gate on OCR status — a handful of legacy runs were marked "failed"
	// after the fact even though `extracted_answers_raw` is fully populated
	// (and grading later succeeded against it). Take the most recent run
	// with a non-empty `answers` array.
	const ocrRuns = await db.ocrRun.findMany({
		where: { submission_id: submissionId },
		orderBy: { created_at: "desc" },
		select: { extracted_answers_raw: true },
	})
	for (const run of ocrRuns) {
		const raw = run.extracted_answers_raw as
			| { answers?: ExtractedAnswer[] }
			| null
		const answers = raw?.answers
		if (answers && answers.length > 0) return answers
	}
	return []
}

// `grading_runs.grading_results` snake_case row shape — see GradingResult in
// `packages/shared/src/editor/types.ts`. Only the fields we actually feed into
// `setQuestionGrade` are listed.
type RawGradingResult = {
	question_id: string
	awarded_score: number
	marking_method: "deterministic" | "point_based" | "level_of_response" | null
	llm_reasoning?: string | null
	feedback_summary?: string | null
	what_went_well?: string[] | null
	even_better_if?: string[] | null
	mark_points_results?: Array<{
		pointNumber: number
		awarded: boolean
		reasoning: string
		expectedCriteria?: string
		studentCovered?: string
	}> | null
	level_awarded?: number | null
	why_not_next_level?: string | null
	cap_applied?: string | null
	mark_scheme_id?: string | null
}

async function loadGradingResults(
	submissionId: string,
): Promise<RawGradingResult[]> {
	const gr = await db.gradingRun.findFirst({
		where: { submission_id: submissionId, status: "complete" },
		orderBy: { created_at: "desc" },
		select: { grading_results: true },
	})
	if (!gr?.grading_results) return []
	const arr = gr.grading_results as RawGradingResult[] | null
	return Array.isArray(arr) ? arr : []
}

function gradingResultToAttrs(r: RawGradingResult): QuestionGradeAttrs {
	return {
		awardedScore: r.awarded_score,
		markingMethod: r.marking_method,
		llmReasoning: r.llm_reasoning ?? null,
		feedbackSummary: r.feedback_summary ?? null,
		whatWentWell: r.what_went_well ?? [],
		evenBetterIf: r.even_better_if ?? [],
		markPointsResults: r.mark_points_results ?? [],
		levelAwarded: r.level_awarded ?? null,
		whyNotNextLevel: r.why_not_next_level ?? null,
		capApplied: r.cap_applied ?? null,
		markSchemeId: r.mark_scheme_id ?? null,
	}
}

async function loadAnnotations(submissionId: string) {
	const sub = await db.studentSubmission.findUnique({
		where: { id: submissionId },
		select: {
			grading_runs: {
				orderBy: { created_at: "desc" },
				take: 1,
				select: { id: true },
			},
		},
	})
	const latestGradingId = sub?.grading_runs[0]?.id ?? null

	const or: Array<Record<string, unknown>> = [
		{ submission_id: submissionId, source: "teacher" },
	]
	if (latestGradingId) or.push({ grading_run_id: latestGradingId })

	return db.studentPaperAnnotation.findMany({
		where: { deleted_at: null, OR: or },
		orderBy: [{ page_order: "asc" }, { sort_order: "asc" }],
	})
}

// ─── Annotation row → AnnotationMarkSpec ────────────────────────────────────

type AnnotationRow = Awaited<ReturnType<typeof loadAnnotations>>[number]

function annotationRowToSpec(
	row: AnnotationRow,
	tokenMap: Record<string, { start: number; end: number }>,
): AnnotationMarkSpec | null {
	if (!row.anchor_token_start_id || !row.anchor_token_end_id) return null
	const start = tokenMap[row.anchor_token_start_id]
	const end = tokenMap[row.anchor_token_end_id]
	if (!start || !end) return null
	if (start.start >= end.end) return null

	const payload = (row.payload ?? {}) as Record<string, unknown>
	let signal: AnnotationSignal | null
	if (row.overlay_type === "chain") {
		signal = "chain"
	} else {
		const raw = payload.signal as string | undefined
		signal = raw && isMarkSignal(raw) ? raw : null
	}
	if (!signal) return null

	const sentiment = (row.sentiment ?? "neutral") as
		| "positive"
		| "negative"
		| "neutral"

	const attrs: Record<string, unknown> = {
		annotationId: row.id,
		reason: payload.reason ?? null,
		scanBbox: row.bbox,
		scanPageOrder: row.page_order,
		scanTokenStartId: row.anchor_token_start_id,
		scanTokenEndId: row.anchor_token_end_id,
	}
	if (payload.ao_category) {
		attrs.ao_category = payload.ao_category
		attrs.ao_display = payload.ao_display ?? payload.ao_category
		attrs.ao_quality = payload.ao_quality ?? "valid"
	}
	if (payload.comment) attrs.comment = payload.comment
	if (row.overlay_type === "chain") {
		attrs.chainType = payload.chainType ?? "reasoning"
		attrs.phrase = payload.phrase ?? null
	}

	return { signal, sentiment, from: start.start, to: end.end, attrs }
}

// ─── Build snapshot ─────────────────────────────────────────────────────────

type BuildResult = {
	bytes: Uint8Array
	stats: {
		questions: number
		answers: number
		gradesApplied: number
		annotationsAttempted: number
		annotationsApplied: number
	}
}

async function buildSnapshot(
	submissionId: string,
	examPaperId: string,
): Promise<BuildResult> {
	const [
		questions,
		extractedAnswers,
		tokensByQuestion,
		annotationRows,
		gradingResults,
	] = await Promise.all([
		loadQuestionSkeletons(examPaperId),
		loadExtractedAnswers(submissionId),
		loadTokensByQuestion(submissionId),
		loadAnnotations(submissionId),
		loadGradingResults(submissionId),
	])

	const knownQuestionIds = new Set(questions.map((q) => q.questionId))

	const perQuestion: PerQuestionAnswer[] = []
	for (const ea of extractedAnswers) {
		if (!knownQuestionIds.has(ea.question_id)) continue
		perQuestion.push({
			questionId: ea.question_id,
			text: ea.answer_text,
			tokens: tokensByQuestion.get(ea.question_id) ?? [],
		})
	}

	const annotationsByQuestionId = new Map<string, AnnotationRow[]>()
	for (const a of annotationRows) {
		const list = annotationsByQuestionId.get(a.question_id) ?? []
		list.push(a)
		annotationsByQuestionId.set(a.question_id, list)
	}

	const knownIds = new Set(questions.map((q) => q.questionId))

	const ydoc = new Y.Doc()
	const view = createHeadlessView(ydoc)

	let annotationsApplied = 0
	let gradesApplied = 0
	try {
		ydoc.transact(() => {
			dispatchExtractedDocOps(view, questions, perQuestion)

			// Apply AI grades — populates awardedScore + feedback fields on
			// questionAnswer blocks AND mcqTable rows. setQuestionGrade routes by
			// questionId. Grades for unknown questions (paper changed since the
			// run) are skipped; the live editor would do the same.
			for (const r of gradingResults) {
				if (!knownIds.has(r.question_id)) continue
				setQuestionGrade(view, r.question_id, gradingResultToAttrs(r))
				gradesApplied++
			}

			for (const q of questions) {
				if (q.questionType === "multiple_choice") continue
				const rows = annotationsByQuestionId.get(q.questionId) ?? []
				if (rows.length === 0) continue

				const text =
					perQuestion.find((p) => p.questionId === q.questionId)?.text ?? ""
				const tokens = tokensByQuestion.get(q.questionId) ?? []
				if (text.length === 0 || tokens.length === 0) continue

				const alignment = alignTokensToAnswer(text, tokens)
				for (const row of rows) {
					const spec = annotationRowToSpec(row, alignment.tokenMap)
					if (!spec) continue
					applyAnnotationMark(view, q.questionId, spec, row.source)
					annotationsApplied++
				}
			}
		}, "migration")

		const bytes = Y.encodeStateAsUpdate(ydoc)
		return {
			bytes,
			stats: {
				questions: questions.length,
				answers: perQuestion.length,
				gradesApplied,
				annotationsAttempted: annotationRows.length,
				annotationsApplied,
			},
		}
	} finally {
		view.destroy()
		ydoc.destroy()
	}
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
	console.log(
		`[migrate] stage=${STAGE} dry-run=${flags.dryRun} force=${flags.force} ` +
			`include-superseded=${flags.includeSuperseded} ` +
			`limit=${flags.limit ?? "(none)"} ` +
			`submission-id=${flags.submissionId ?? "(none)"} ` +
			`exam-paper-id=${flags.examPaperId ?? "(none)"}`,
	)

	const submissions = await loadSubmissions()
	console.log(`[migrate] candidate submissions: ${submissions.length}`)

	let migrated = 0
	let skipped = 0
	let failed = 0

	for (const sub of submissions) {
		const documentName = buildSubmissionDocumentName(STAGE, sub.id)
		try {
			if (!flags.force) {
				const exists = await snapshotExists(documentName)
				if (exists) {
					skipped++
					console.log(`[migrate] skip (exists) ${documentName}`)
					continue
				}
			}

			const { bytes, stats } = await buildSnapshot(sub.id, sub.exam_paper_id)
			console.log(
				`[migrate] built ${documentName} bytes=${bytes.byteLength} ` +
					`questions=${stats.questions} answers=${stats.answers} ` +
					`grades=${stats.gradesApplied} ` +
					`annotations=${stats.annotationsApplied}/${stats.annotationsAttempted}`,
			)

			if (flags.dryRun) {
				console.log(`[migrate] dry-run: skipped PUT for ${documentName}`)
			} else {
				await putSnapshot(documentName, bytes)
				console.log(`[migrate] put s3://${bucket}/${keyFor(documentName)}`)
			}
			migrated++
		} catch (err) {
			failed++
			console.error(
				`[migrate] FAIL ${sub.id}:`,
				err instanceof Error ? err.stack ?? err.message : err,
			)
		}
	}

	console.log(
		`[migrate] done. migrated=${migrated} skipped=${skipped} failed=${failed}`,
	)
}

main()
	.catch((err) => {
		console.error("[migrate] fatal:", err)
		process.exitCode = 1
	})
	.finally(async () => {
		await db.$disconnect()
	})
