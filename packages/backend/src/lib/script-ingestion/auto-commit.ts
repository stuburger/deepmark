import { db } from "@/db"
import { logger } from "@/lib/infra/logger"
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs"
import type { BatchStatus, StagedScriptStatus } from "@mcp-gcse/db"
import { Resource } from "sst"

const TAG = "batch-classify"
const sqs = new SQSClient({})

type PageKey = {
	s3_key: string
	order: number
	mime_type: string
	source_file: string
}

/**
 * Transitions all staged scripts to confirmed, creates StudentSubmission
 * records, and sends each to the OCR queue for processing.
 */
export async function autoCommitBatch(
	batchJobId: string,
	examPaper: {
		id: string
		exam_board: string | null
		subject: string
		year: number
	},
): Promise<void> {
	const batch = await db.batchIngestJob.findUniqueOrThrow({
		where: { id: batchJobId },
		select: { uploaded_by: true },
	})

	const stagedScripts = await db.stagedScript.findMany({
		where: { batch_job_id: batchJobId, status: "excluded" },
	})

	await db.stagedScript.updateMany({
		where: { batch_job_id: batchJobId, status: "excluded" },
		data: { status: "confirmed" as StagedScriptStatus },
	})

	const createdJobs = await Promise.all(
		stagedScripts.map((script) => {
			const pageKeys = script.page_keys as PageKey[]
			return db.studentSubmission.create({
				data: {
					s3_key: pageKeys[0]?.s3_key ?? "",
					s3_bucket: Resource.ScansBucket.name,
					uploaded_by: batch.uploaded_by,
					exam_paper_id: examPaper.id,
					exam_board: examPaper.exam_board ?? "Unknown",
					subject: examPaper.subject as never,
					year: examPaper.year,
					pages: pageKeys.map(({ s3_key, order, mime_type }) => ({
						key: s3_key,
						order,
						mime_type,
					})) as never,
					student_name: script.proposed_name,
					batch_job_id: batchJobId,
					staged_script_id: script.id,
				},
			})
		}),
	)

	await db.batchIngestJob.update({
		where: { id: batchJobId },
		data: {
			status: "marking" as BatchStatus,
			total_student_jobs: createdJobs.length,
		},
	})

	for (const job of createdJobs) {
		await sqs.send(
			new SendMessageCommand({
				QueueUrl: Resource.StudentPaperOcrQueue.url,
				MessageBody: JSON.stringify({ job_id: job.id }),
			}),
		)
	}

	logger.info(TAG, "Auto-commit complete", {
		batchJobId,
		submissionsCreated: createdJobs.length,
	})
}
