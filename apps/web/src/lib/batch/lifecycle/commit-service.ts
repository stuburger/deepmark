// Server-only helper. NOT a "use server" module — this is internal service code
// callable from server actions, queue-handler glue, and SSR pages, but never
// from a client component. The auth boundary is the caller's job.

import { db } from "@/lib/db"
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs"
import {
	type BatchStatus,
	ResourceGrantPrincipalType,
	ResourceGrantResourceType,
	ResourceGrantRole,
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

				const submission = await tx.studentSubmission.create({
					data: {
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
				return submission
			}),
		)

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
