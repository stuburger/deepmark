// Server-only helper. NOT a "use server" module — this is internal service code
// callable from server actions, queue-handler glue, and SSR pages, but never
// from a client component. The auth boundary is the caller's job.

import { randomUUID } from "node:crypto"
import { insertConsumesForBatch } from "@/lib/billing/ledger"
import { db } from "@/lib/db"
import {
	SQSClient,
	SendMessageBatchCommand,
	type SendMessageBatchRequestEntry,
} from "@aws-sdk/client-sqs"
import {
	type BatchStatus,
	ResourceGrantPrincipalType,
	ResourceGrantResourceType,
	ResourceGrantRole,
	lookupCurrentPeriodId,
} from "@mcp-gcse/db"
import { Resource } from "sst"
import { parsePageKeys } from "../types"

const bucketName = Resource.ScansBucket.name
const sqs = new SQSClient({})

export type CommitBatchResult =
	| { ok: true; studentJobCount: number }
	| { ok: false; error: string }

/**
 * Commits a batch — creates a StudentSubmission per confirmed staged script,
 * marks the staged scripts as submitted, and enqueues the OCR job for each
 * new submission.
 *
 * Caller (the `commitBatch` server action, or any future internal pipeline)
 * is responsible for verifying that `uploadedBy` has editor rights on the
 * batch.
 */
export async function commitBatchService(
	batchJobId: string,
	uploadedBy: string,
): Promise<CommitBatchResult> {
	const batch = await db.batchIngestJob.findFirst({
		where: { id: batchJobId },
		include: {
			staged_scripts: {
				where: { status: "confirmed" },
			},
			exam_paper: {
				select: {
					id: true,
					exam_board: true,
					subject: true,
					year: true,
				},
			},
		},
	})

	if (!batch) return { ok: false, error: "Batch job not found" }
	// A batch can exist without an exam paper while the bundle handler is
	// still running in parallel (wizard path) or indefinitely in the future
	// email-a-stack workflow. Committing requires the paper to be linked.
	const examPaper = batch.exam_paper
	if (!examPaper) {
		return {
			ok: false,
			error:
				"Batch is not yet linked to an exam paper — wait for extraction to finish.",
		}
	}

	// Exclude scripts already submitted in a previous commit. Walked via the
	// staged_script join now that StudentSubmission no longer carries a direct
	// batch_job_id — staged_script_id is the only durable link.
	const alreadyCommitted = await db.studentSubmission.findMany({
		where: {
			staged_script: { batch_job_id: batchJobId },
			superseded_at: null,
		},
		select: { staged_script_id: true },
	})
	const alreadySubmitted = new Set(
		alreadyCommitted.map((j) => j.staged_script_id),
	)
	const confirmedScripts = batch.staged_scripts.filter(
		(s) => !alreadySubmitted.has(s.id),
	)

	if (confirmedScripts.length === 0) {
		return { ok: false, error: "No confirmed scripts to commit" }
	}

	// Snapshot the user's current billing period BEFORE the transaction so all
	// reserved consume rows in this batch share the same period_id (and the
	// snapshot is stable even if a webhook for a new invoice lands mid-commit).
	// `null` for trial / PPU-only / Unlimited — only capped Pro users have one.
	const userPlan = await db.user.findUnique({
		where: { id: uploadedBy },
		select: { plan: true, role: true },
	})
	const skipLedger =
		userPlan?.role === "admin" || userPlan?.plan === "unlimited_monthly"
	const periodId = skipLedger
		? null
		: await lookupCurrentPeriodId({
				db,
				userId: uploadedBy,
				plan: userPlan?.plan ?? null,
			})

	const createdJobs = await db.$transaction(async (tx) => {
		// One ProcessingBatch per commit-event. Each commit produces a fresh
		// notification group: if a teacher commits the upload in chunks (3 +
		// 12 + 5), each chunk gets its own ProcessingBatch and its own email
		// when grading finishes. That matches user mental model — they kicked
		// off three jobs, they get three confirmations.
		const processingBatch = await tx.processingBatch.create({
			data: {
				exam_paper_id: examPaper.id,
				triggered_by: uploadedBy,
				kind: "initial",
				total_jobs: confirmedScripts.length,
				ingest_batch_id: batchJobId,
			},
		})

		const jobs = await Promise.all(
			confirmedScripts.map(async (script) => {
				const pageKeys = parsePageKeys(script.page_keys)
				const pagesJson = pageKeys.map(({ s3_key, order, mime_type }) => ({
					key: s3_key,
					order,
					mime_type,
				}))
				const studentName = script.confirmed_name ?? script.proposed_name

				// Pre-generate the submission id so we can wire OcrRun + GradingRun
				// + paper_ledger consume row (all sharing the same id) atomically.
				const submissionId = randomUUID()

				const submission = await tx.studentSubmission.create({
					data: {
						id: submissionId,
						s3_key: pageKeys[0]?.s3_key ?? "",
						s3_bucket: bucketName,
						uploaded_by: uploadedBy,
						exam_paper_id: examPaper.id,
						exam_board: examPaper.exam_board ?? "Unknown",
						subject: examPaper.subject,
						year: examPaper.year,
						pages: pagesJson as never,
						student_name: studentName,
						processing_batch_id: processingBatch.id,
						staged_script_id: script.id,
					},
				})
				await tx.resourceGrant.create({
					data: {
						resource_type: ResourceGrantResourceType.student_submission,
						resource_id: submission.id,
						principal_type: ResourceGrantPrincipalType.user,
						principal_user_id: uploadedBy,
						role: ResourceGrantRole.owner,
						created_by: uploadedBy,
						accepted_at: new Date(),
					},
				})
				// OcrRun + GradingRun pre-created in `pending` so the consume row's
				// FK to grading_run is satisfied immediately. The OCR Lambda upserts
				// (treats existing pending row as "claim and run"), the grade Lambda's
				// `claimGradingRun` already handles a pre-existing pending row.
				await tx.ocrRun.create({
					data: {
						id: submissionId,
						submission_id: submissionId,
						status: "pending",
					},
				})
				await tx.gradingRun.create({
					data: {
						id: submissionId,
						submission_id: submissionId,
						ocr_run_id: submissionId,
						status: "pending",
					},
				})
				return submission
			}),
		)

		// Reserve the paper-ledger consume rows atomically with the work above.
		// Skipped for admin / Unlimited (uncapped). Otherwise insertConsumesForBatch
		// takes a per-user pg_advisory_xact_lock + balance recheck before
		// inserting, so a parallel batch racing past the same pre-check
		// gets rolled back here with InsufficientBalanceError instead of
		// driving the balance negative.
		if (!skipLedger) {
			await insertConsumesForBatch({
				userId: uploadedBy,
				gradingRunIds: jobs.map((j) => j.id),
				periodId,
				plan: userPlan?.plan ?? null,
				tx,
			})
		}

		// Mark staged scripts as submitted so the batch query doesn't need to join submissions
		await tx.stagedScript.updateMany({
			where: { id: { in: confirmedScripts.map((s) => s.id) } },
			data: { status: "submitted" },
		})

		// Stay in `staging` as long as there are still undecided scripts so the
		// review dialog can be re-opened to handle the leftovers (teacher
		// submits 2 of 14 → 12 proposed remain → dialog stays available).
		// Only flip to `committed` when every script has been resolved
		// (submitted or excluded). Each commit already creates its own
		// ProcessingBatch (above), so the "marking complete" email still fires
		// once per sub-batch — this only affects ingest UI visibility.
		const undecidedCount = await tx.stagedScript.count({
			where: { batch_job_id: batchJobId, status: "proposed" },
		})
		if (undecidedCount === 0) {
			await tx.batchIngestJob.update({
				where: { id: batchJobId },
				data: { status: "committed" as BatchStatus },
			})
		}

		return jobs
	})

	// SQS sends happen AFTER the DB transaction commits, so any failure here
	// strands the OcrRun pre-row in `pending` with no events — visually "stuck
	// in extracting" forever. The fix has two halves:
	//   1) batch the sends (SendMessageBatchCommand, up to 10 per call) so a
	//      single network call carries them all, reducing the per-message
	//      failure surface and round-trips.
	//   2) collect per-message failures and surface them on OcrRun.status =
	//      "failed" + error so the UI shows a real error and the teacher can
	//      hit "Re-scan" instead of staring at an unmoving spinner.
	const failedSubmissionIds = await enqueueOcrJobs(createdJobs.map((j) => j.id))
	if (failedSubmissionIds.length > 0) {
		await db.ocrRun.updateMany({
			where: { submission_id: { in: failedSubmissionIds } },
			data: {
				status: "failed",
				error: "Failed to enqueue OCR job — please re-scan.",
			},
		})
	}

	return { ok: true, studentJobCount: createdJobs.length }
}

/**
 * Enqueues StudentPaperOcrQueue messages for every submission id, batched in
 * groups of 10 (the SQS limit). Returns the submission ids whose enqueue
 * failed — callers should mark those OcrRuns failed so they don't sit pending
 * forever. Never throws; partial failure is the whole point.
 */
async function enqueueOcrJobs(submissionIds: string[]): Promise<string[]> {
	const failed: string[] = []
	for (let i = 0; i < submissionIds.length; i += 10) {
		const chunk = submissionIds.slice(i, i + 10)
		const entries: SendMessageBatchRequestEntry[] = chunk.map(
			(submissionId, idx) => ({
				Id: String(idx),
				MessageBody: JSON.stringify({ job_id: submissionId }),
			}),
		)
		try {
			const result = await sqs.send(
				new SendMessageBatchCommand({
					QueueUrl: Resource.StudentPaperOcrQueue.url,
					Entries: entries,
				}),
			)
			for (const f of result.Failed ?? []) {
				const idx = Number(f.Id)
				const submissionId = chunk[idx]
				if (submissionId) failed.push(submissionId)
			}
		} catch {
			// Whole-batch failure (auth, network, throttling). Mark every id in
			// this chunk failed — better one false positive than a silent stall.
			failed.push(...chunk)
		}
	}
	return failed
}
