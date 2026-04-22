"use server"

import { db } from "@/lib/db"
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs"
import type { BatchStatus } from "@mcp-gcse/db"
import { Resource } from "sst"
import { auth } from "../../auth"
import { log } from "../../logger"
import { parsePageKeys } from "../types"

const TAG = "batch/lifecycle"

const bucketName = Resource.ScansBucket.name
const sqs = new SQSClient({})

// ─── commitBatch ────────────────────────────────────────────────────────────

export type CommitBatchResult =
	| { ok: true; studentJobCount: number }
	| { ok: false; error: string }

export async function commitBatch(
	batchJobId: string,
): Promise<CommitBatchResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	return commitBatchService(batchJobId, session.userId)
}

// ─── commitBatchService ─────────────────────────────────────────────────────
//
// Extracted so it can be called directly from server-side code (e.g. tests,
// auto-commit flows) without going through the auth boundary.

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

				return tx.studentSubmission.create({
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

	log.info(TAG, "Batch committed", {
		userId: uploadedBy,
		batchJobId,
		jobCount: createdJobs.length,
	})

	return { ok: true, studentJobCount: createdJobs.length }
}
