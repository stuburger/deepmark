import { db } from "@/db"
import {
	buildDesiredRows,
	diffAnnotations,
} from "@/lib/annotations/projection-diff"
import { getEditorSchema } from "@/lib/collab/editor-schema"
import {
	type DesiredRow as MarkingResultDesiredRow,
	type ExistingRow as MarkingResultExistingRow,
	buildDesiredRows as buildDesiredMarkingResultRows,
	diffMarkingResults,
} from "@/lib/grading/marking-result-projection"
import { logger } from "@/lib/infra/logger"
import type { SqsEvent } from "@/lib/infra/sqs-job-runner"
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3"
import type { Prisma } from "@mcp-gcse/db"
import {
	DOC_FRAGMENT_NAME,
	type DerivedTeacherOverride,
	type GradingResult,
	type MarkPointResult,
	type StudentPaperAnnotation,
	deriveAnnotationsFromDoc,
	deriveExaminerSummaryFromDoc,
	deriveGradingResultsFromDoc,
	deriveTeacherOverridesFromDoc,
	parseDocumentName,
} from "@mcp-gcse/shared"
import { yXmlFragmentToProsemirrorJSON } from "@tiptap/y-tiptap"
import * as Y from "yjs"

const TAG = "annotation-projection"
const STAGE = process.env.STAGE ?? "dev"

type S3EventRecord = {
	s3: {
		bucket: { name: string }
		object: { key: string }
	}
}

const s3 = new S3Client({})

/**
 * Consumes S3 ObjectCreated events for `yjs/*.bin` snapshots produced by
 * Hocuspocus's Database extension. Decodes the Y.Doc, walks the document
 * fragment via `deriveAnnotationsFromDoc` (the same function the web client
 * uses), and projects the result onto `student_paper_annotations` rows.
 *
 * Each annotation mark carries a `source` attr ("ai" or "teacher") set by
 * its writer (the grading Lambda or the web client's `applyAnnotationMark`).
 * The projection reads it onto the row's `source` column.
 *
 * Idempotent and minimally invasive: each invocation diffs the desired
 * rows (derived from the current Y.Doc) against the existing rows by
 * stable mark id, then issues only the inserts/updates/deletes needed to
 * converge — no row churn for unchanged marks. Stable ids come from the
 * `annotationId` mark attr (a UUID for teacher marks, a
 * `${jobId}:${questionId}:${sortOrder}` composite for AI marks).
 *
 * Stage isolation: document names are prefixed with the owning stage
 * (`${stage}:submission:${id}`). Records whose prefix doesn't match the
 * current STAGE env var are skipped — defense in depth against misrouted
 * events.
 */
export async function handler(
	event: SqsEvent,
): Promise<{ batchItemFailures?: { itemIdentifier: string }[] }> {
	const failures: { itemIdentifier: string }[] = []

	for (const record of event.Records) {
		try {
			const body = JSON.parse(record.body) as { Records?: S3EventRecord[] }
			for (const s3Record of body.Records ?? []) {
				await processRecord(s3Record)
			}
		} catch (err) {
			const error = err instanceof Error ? err.message : String(err)
			logger.error(TAG, "Projection record failed", {
				messageId: record.messageId,
				error,
			})
			failures.push({ itemIdentifier: record.messageId })
		}
	}

	return failures.length > 0 ? { batchItemFailures: failures } : {}
}

async function processRecord(rec: S3EventRecord): Promise<void> {
	const key = decodeURIComponent(rec.s3.object.key.replace(/\+/g, " "))
	const match = key.match(/^yjs\/([^/]+)\.bin$/)
	if (!match) {
		// Non-yjs key — some other consumer's event bled through. Skip silently.
		return
	}
	const [, docName] = match
	const parsed = parseDocumentName(docName)
	if (!parsed) {
		logger.warn(TAG, "Invalid doc name", { docName })
		return
	}
	if (parsed.stage !== STAGE) {
		// Different stage's doc — skip cleanly.
		return
	}
	const submissionId = parsed.id

	const bytes = await downloadSnapshot(rec.s3.bucket.name, key)
	if (!bytes) {
		logger.warn(TAG, "No snapshot bytes", { key })
		return
	}

	let derived: ProjectedSnapshot
	try {
		derived = deriveSnapshot(bytes)
	} catch (err) {
		// Surface the submissionId + key so on-call can correlate with the
		// snapshot in S3. Re-throwing makes the SQS handler mark the record as
		// a per-message failure (eventual DLQ) — preferable to silently
		// projecting "no annotations" and wiping the submission's rows.
		const error = err instanceof Error ? err.message : String(err)
		logger.error(TAG, "Failed to decode snapshot", { submissionId, key, error })
		throw err
	}

	await Promise.all([
		replaceAnnotations(submissionId, derived.annotations),
		writeGradingResults(submissionId, derived.gradingResults),
		writeExaminerSummary(submissionId, derived.examinerSummary),
		replaceTeacherOverrides(submissionId, derived.teacherOverrides),
		writeMarkingResults(submissionId, derived.gradingResults),
	])

	logger.info(TAG, "Projection complete", {
		submissionId,
		annotations: derived.annotations.length,
		gradingResults: derived.gradingResults.length,
		teacherOverrides: derived.teacherOverrides.length,
		examinerSummary: derived.examinerSummary?.length ?? 0,
	})
}

type ProjectedSnapshot = {
	annotations: StudentPaperAnnotation[]
	gradingResults: GradingResult[]
	teacherOverrides: DerivedTeacherOverride[]
	examinerSummary: string | null
}

/**
 * Decodes the Y.Doc snapshot once and projects every kind of derived
 * data the projection Lambda owns: annotations (rows), grade metadata
 * (JSON column on GradingRun), and teacher overrides (TeacherOverride
 * rows). All three derivations walk the same `PmNode` so the snapshot
 * is only deserialized once per invocation.
 */
function deriveSnapshot(bytes: Uint8Array): ProjectedSnapshot {
	const doc = new Y.Doc()
	try {
		Y.applyUpdate(doc, bytes)
		const fragment = doc.getXmlFragment(DOC_FRAGMENT_NAME)
		if (fragment.length === 0) {
			return {
				annotations: [],
				gradingResults: [],
				teacherOverrides: [],
				examinerSummary: null,
			}
		}
		const json = yXmlFragmentToProsemirrorJSON(fragment)
		const node = getEditorSchema().nodeFromJSON(json)
		return {
			annotations: deriveAnnotationsFromDoc(node),
			gradingResults: deriveGradingResultsFromDoc(node),
			teacherOverrides: deriveTeacherOverridesFromDoc(node),
			examinerSummary: deriveExaminerSummaryFromDoc(node),
		}
	} finally {
		doc.destroy()
	}
}

async function downloadSnapshot(
	bucket: string,
	key: string,
): Promise<Uint8Array | null> {
	const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
	if (!res.Body) return null
	const bytes = await res.Body.transformToByteArray()
	return new Uint8Array(bytes)
}

async function replaceAnnotations(
	submissionId: string,
	derived: StudentPaperAnnotation[],
): Promise<void> {
	// Resolve grading_run_id from the latest run so AI rows have a back-reference
	// for consumers that group by grading run. Teacher rows carry null per the
	// schema convention.
	const latestGradingRun = await db.gradingRun.findFirst({
		where: { submission_id: submissionId },
		orderBy: { created_at: "desc" },
		select: { id: true },
	})
	const gradingRunId = latestGradingRun?.id ?? null
	const desired = buildDesiredRows(derived, gradingRunId)

	await db.$transaction(async (tx) => {
		const existing = await tx.studentPaperAnnotation.findMany({
			where: { submission_id: submissionId },
			select: {
				id: true,
				source: true,
				grading_run_id: true,
				question_id: true,
				page_order: true,
				overlay_type: true,
				sentiment: true,
				payload: true,
				anchor_token_start_id: true,
				anchor_token_end_id: true,
				bbox: true,
				sort_order: true,
			},
		})

		const plan = diffAnnotations(existing, desired)

		if (plan.deleteIds.length > 0) {
			await tx.studentPaperAnnotation.deleteMany({
				where: { id: { in: plan.deleteIds } },
			})
		}
		if (plan.inserts.length > 0) {
			await tx.studentPaperAnnotation.createMany({
				data: plan.inserts.map((r) => ({
					id: r.id,
					submission_id: submissionId,
					grading_run_id: r.grading_run_id,
					source: r.source,
					question_id: r.question_id,
					page_order: r.page_order,
					overlay_type: r.overlay_type,
					sentiment: r.sentiment,
					payload: r.payload as Prisma.InputJsonValue,
					anchor_token_start_id: r.anchor_token_start_id,
					anchor_token_end_id: r.anchor_token_end_id,
					bbox: r.bbox as Prisma.InputJsonValue,
					sort_order: r.sort_order,
				})),
			})
		}
		// Updates run sequentially — Prisma forbids concurrent ops inside a
		// single transaction. In practice each projection has at most a
		// handful of changed marks (one user action ≈ one diff), so
		// sequential issue is fine.
		for (const r of plan.updates) {
			await tx.studentPaperAnnotation.update({
				where: { id: r.id },
				data: {
					grading_run_id: r.grading_run_id,
					source: r.source,
					question_id: r.question_id,
					page_order: r.page_order,
					overlay_type: r.overlay_type,
					sentiment: r.sentiment,
					payload: r.payload as Prisma.InputJsonValue,
					anchor_token_start_id: r.anchor_token_start_id,
					anchor_token_end_id: r.anchor_token_end_id,
					bbox: r.bbox as Prisma.InputJsonValue,
					sort_order: r.sort_order,
				},
			})
		}

		logger.info(TAG, "Annotation diff applied", {
			submissionId,
			inserts: plan.inserts.length,
			updates: plan.updates.length,
			deletes: plan.deleteIds.length,
			unchanged: existing.length - plan.deleteIds.length - plan.updates.length,
		})
	})
}

/**
 * Write the per-question grade payload onto `GradingRun.grading_results`
 * (JSON column). The grading results array is rebuilt wholesale from
 * the doc each projection — this column is a CURRENT-STATE projection,
 * not an event-sourced log. The grade Lambda no longer writes this
 * column directly; the doc + this projection are the only paths.
 *
 * No-op if no GradingRun row exists yet (the row is created lifecycle-
 * side by `markJobAsGrading` before grading starts; if the snapshot
 * fires before that runs, just skip).
 */
async function writeGradingResults(
	submissionId: string,
	gradingResults: GradingResult[],
): Promise<void> {
	const existing = await db.gradingRun.findUnique({
		where: { id: submissionId },
		select: { id: true },
	})
	if (!existing) return

	await db.gradingRun.update({
		where: { id: submissionId },
		data: { grading_results: gradingResults as Prisma.InputJsonValue },
	})
}

/**
 * Mirror the doc's leading paragraph(s) onto `GradingRun.examiner_summary`.
 * The grading Lambda seeds an initial AI summary on completion; this
 * projection keeps the column current as the teacher edits the paragraph
 * inline in the editor — without it, the PDF export keeps showing the
 * original AI text.
 *
 * Same no-op-when-no-row guard as `writeGradingResults`.
 */
async function writeExaminerSummary(
	submissionId: string,
	examinerSummary: string | null,
): Promise<void> {
	const existing = await db.gradingRun.findUnique({
		where: { id: submissionId },
		select: { id: true, examiner_summary: true },
	})
	if (!existing) return
	if (existing.examiner_summary === examinerSummary) return

	await db.gradingRun.update({
		where: { id: submissionId },
		data: { examiner_summary: examinerSummary },
	})
}

/**
 * Project per-question grades onto normalised `Answer` + `MarkingResult`
 * rows. The doc remains the live source of truth — these rows exist for
 * SQL analytics (avg score per question, per-student trajectory across
 * papers, hardest/easiest question) which the JSON column on GradingRun
 * can't serve at scale.
 *
 * Stable identity is `(submission_id, question_id)`. Each Answer has at
 * most one MarkingResult — the projection rebuilds it on every snapshot
 * and prunes any stale extras. Yjs is the temporal log; this table is a
 * current-state projection.
 *
 * Rows derived from a question with no `mark_scheme_id` are skipped —
 * the schema requires `MarkingResult.mark_scheme_id` non-null, and an
 * orphan Answer would defeat the 1:1 invariant.
 */
export async function writeMarkingResults(
	submissionId: string,
	gradingResults: GradingResult[],
): Promise<void> {
	const desired = buildDesiredMarkingResultRows(gradingResults)

	await db.$transaction(async (tx) => {
		const existingAnswers = await tx.answer.findMany({
			where: { submission_id: submissionId },
			select: {
				id: true,
				question_id: true,
				student_answer: true,
				total_score: true,
				max_possible_score: true,
				marking_results: {
					orderBy: { marked_at: "desc" },
					select: {
						id: true,
						mark_scheme_id: true,
						mark_points_results: true,
						feedback_summary: true,
						llm_reasoning: true,
						level_awarded: true,
						why_not_next_level: true,
						cap_applied: true,
					},
				},
			},
		})

		const existing: MarkingResultExistingRow[] = existingAnswers.map((a) => {
			const mr = a.marking_results[0] ?? null
			return {
				answer_id: a.id,
				marking_result_id: mr?.id ?? null,
				question_id: a.question_id,
				mark_scheme_id: mr?.mark_scheme_id ?? null,
				student_answer: a.student_answer,
				total_score: a.total_score,
				max_possible_score: a.max_possible_score,
				mark_points_results:
					(mr?.mark_points_results as MarkPointResult[] | null) ?? [],
				feedback_summary: mr?.feedback_summary ?? "",
				llm_reasoning: mr?.llm_reasoning ?? "",
				level_awarded: mr?.level_awarded ?? null,
				why_not_next_level: mr?.why_not_next_level ?? null,
				cap_applied: mr?.cap_applied ?? null,
			}
		})

		const plan = diffMarkingResults(existing, desired)

		if (plan.deleteAnswerIds.length > 0) {
			await tx.markingResult.deleteMany({
				where: { answer_id: { in: plan.deleteAnswerIds } },
			})
			await tx.answer.deleteMany({
				where: { id: { in: plan.deleteAnswerIds } },
			})
		}

		const markedAt = new Date()
		for (const row of plan.inserts) {
			const answer = await tx.answer.create({
				data: {
					submission_id: submissionId,
					question_id: row.question_id,
					student_answer: row.student_answer,
					total_score: row.awarded_score,
					max_possible_score: row.max_score,
					marking_status: "completed",
					source: "scanned",
					marked_at: markedAt,
				},
				select: { id: true },
			})
			await tx.markingResult.create({
				data: {
					answer_id: answer.id,
					mark_scheme_id: row.mark_scheme_id,
					mark_points_results: row.mark_points_results as Prisma.InputJsonValue,
					total_score: row.awarded_score,
					max_possible_score: row.max_score,
					marked_at: markedAt,
					llm_reasoning: row.llm_reasoning,
					feedback_summary: row.feedback_summary,
					level_awarded: row.level_awarded,
					why_not_next_level: row.why_not_next_level,
					cap_applied: row.cap_applied,
				},
			})
		}

		for (const u of plan.updates) {
			await applyMarkingResultUpdate(tx, u, markedAt)
		}

		logger.info(TAG, "Marking-result diff applied", {
			submissionId,
			inserts: plan.inserts.length,
			updates: plan.updates.length,
			deletes: plan.deleteAnswerIds.length,
			unchanged:
				existing.length - plan.deleteAnswerIds.length - plan.updates.length,
		})
	})
}

async function applyMarkingResultUpdate(
	tx: Prisma.TransactionClient,
	u: { answer_id: string; marking_result_id: string | null; row: MarkingResultDesiredRow },
	markedAt: Date,
): Promise<void> {
	const { answer_id, marking_result_id, row } = u
	await tx.answer.update({
		where: { id: answer_id },
		data: {
			student_answer: row.student_answer,
			total_score: row.awarded_score,
			max_possible_score: row.max_score,
			marking_status: "completed",
			marked_at: markedAt,
		},
	})
	if (marking_result_id) {
		await tx.markingResult.update({
			where: { id: marking_result_id },
			data: {
				mark_scheme_id: row.mark_scheme_id,
				mark_points_results: row.mark_points_results as Prisma.InputJsonValue,
				total_score: row.awarded_score,
				max_possible_score: row.max_score,
				marked_at: markedAt,
				llm_reasoning: row.llm_reasoning,
				feedback_summary: row.feedback_summary,
				level_awarded: row.level_awarded,
				why_not_next_level: row.why_not_next_level,
				cap_applied: row.cap_applied,
			},
		})
		return
	}
	// Existing Answer with no MarkingResult — create the missing pair half.
	await tx.markingResult.create({
		data: {
			answer_id,
			mark_scheme_id: row.mark_scheme_id,
			mark_points_results: row.mark_points_results as Prisma.InputJsonValue,
			total_score: row.awarded_score,
			max_possible_score: row.max_score,
			marked_at: markedAt,
			llm_reasoning: row.llm_reasoning,
			feedback_summary: row.feedback_summary,
			level_awarded: row.level_awarded,
			why_not_next_level: row.why_not_next_level,
			cap_applied: row.cap_applied,
		},
	})
}

/**
 * Mirror the doc's per-question teacher overrides onto the
 * `TeacherOverride` table. The table has `@@unique([submission_id, question_id])`
 * so we drive a three-way diff: rows in PG missing from the doc are
 * deleted; rows in the doc missing from PG are inserted; same-key rows
 * with changed payload are updated.
 *
 * Only entries that carry a non-null `score_override` AND non-null
 * `set_by` are projected — the schema requires both. Feedback-only
 * overrides without a score live only in the doc; analytics consumers
 * that need them should read the doc directly via `deriveTeacherOverridesFromDoc`.
 */
async function replaceTeacherOverrides(
	submissionId: string,
	derived: DerivedTeacherOverride[],
): Promise<void> {
	const projectable = derived.filter(
		(d) => d.score_override != null && d.set_by != null,
	)
	const desiredByQuestion = new Map(projectable.map((d) => [d.question_id, d]))

	const existing = await db.teacherOverride.findMany({
		where: { submission_id: submissionId },
		select: {
			id: true,
			question_id: true,
			score_override: true,
			reason: true,
			feedback_override: true,
		},
	})
	const existingByQuestion = new Map(existing.map((e) => [e.question_id, e]))

	await db.$transaction(async (tx) => {
		const deletes = existing
			.filter((e) => !desiredByQuestion.has(e.question_id))
			.map((e) => e.id)
		if (deletes.length > 0) {
			await tx.teacherOverride.deleteMany({
				where: { id: { in: deletes } },
			})
		}

		for (const d of projectable) {
			const e = existingByQuestion.get(d.question_id)
			if (!e) {
				await tx.teacherOverride.create({
					data: {
						submission_id: submissionId,
						question_id: d.question_id,
						// non-null guaranteed by `projectable` filter above
						score_override: d.score_override as number,
						reason: d.reason,
						feedback_override: d.feedback_override,
						created_by: d.set_by as string,
					},
				})
				continue
			}
			const unchanged =
				e.score_override === d.score_override &&
				e.reason === d.reason &&
				e.feedback_override === d.feedback_override
			if (unchanged) continue
			await tx.teacherOverride.update({
				where: { id: e.id },
				data: {
					score_override: d.score_override as number,
					reason: d.reason,
					feedback_override: d.feedback_override,
				},
			})
		}
	})
}
