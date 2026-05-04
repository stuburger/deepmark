// Server-only helper. NOT a "use server" module — this is internal service code
// callable from server actions, queue-handler glue, and SSR pages, but never
// from a client component. The auth boundary is the caller's job.

import { randomUUID } from "node:crypto"
import { insertConsumesForBatch } from "@/lib/billing/ledger"
import { db } from "@/lib/db"
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs"
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
			student_submissions: {
				where: { superseded_at: null },
				select: { staged_script_id: true },
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

	// Exclude scripts already submitted in a previous commit
	const alreadySubmitted = new Set(
		batch.student_submissions.map((j) => j.staged_script_id).filter(Boolean),
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
	// `null` for trial / PPU-only / Limitless — only capped Pro users have one.
	const userPlan = await db.user.findUnique({
		where: { id: uploadedBy },
		select: { plan: true, role: true },
	})
	const skipLedger =
		userPlan?.role === "admin" || userPlan?.plan === "limitless_monthly"
	const periodId = skipLedger
		? null
		: await lookupCurrentPeriodId({
				db,
				userId: uploadedBy,
				plan: userPlan?.plan ?? null,
			})

	const createdJobs = await db.$transaction(async (tx) => {
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
						exam_paper_id: batch.exam_paper.id,
						exam_board: batch.exam_paper.exam_board ?? "Unknown",
						subject: batch.exam_paper.subject,
						year: batch.exam_paper.year,
						pages: pagesJson as never,
						student_name: studentName,
						batch_job_id: batchJobId,
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
		// Skipped for admin / Limitless (uncapped). For trial / PPU-only / Pro
		// the consume rows enforce balance via the assertPapersQuota pre-check;
		// the createMany lands inside the same tx so a double-submit race would
		// roll one of the two transactions back via Postgres serialisation on
		// the unique index.
		if (!skipLedger) {
			await insertConsumesForBatch({
				userId: uploadedBy,
				gradingRunIds: jobs.map((j) => j.id),
				periodId,
				tx,
			})
		}

		// Mark staged scripts as submitted so the batch query doesn't need to join submissions
		await tx.stagedScript.updateMany({
			where: { id: { in: confirmedScripts.map((s) => s.id) } },
			data: { status: "submitted" },
		})

		await tx.batchIngestJob.update({
			where: { id: batchJobId },
			data: {
				status: "marking" as BatchStatus,
				total_student_jobs: { increment: jobs.length },
			},
		})

		return jobs
	})

	for (const job of createdJobs) {
		await sqs.send(
			new SendMessageCommand({
				QueueUrl: Resource.StudentPaperOcrQueue.url,
				MessageBody: JSON.stringify({ job_id: job.id }),
			}),
		)
	}

	return { ok: true, studentJobCount: createdJobs.length }
}
