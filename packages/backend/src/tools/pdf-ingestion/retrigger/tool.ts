import { db } from "@/db"
import { tool } from "@/tools/shared/tool-utils"
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs"
import { Resource } from "sst"
import { RetriggerPdfIngestionJobSchema } from "./schema"

const sqs = new SQSClient({})

export const handler = tool(RetriggerPdfIngestionJobSchema, async (args) => {
	const { job_id } = args
	const job = await db.pdfIngestionJob.findUniqueOrThrow({
		where: { id: job_id },
	})
	const terminal = ["failed", "ocr_complete"]
	if (!terminal.includes(job.status)) {
		throw new Error(
			`Job can only be retriggered when status is failed or ocr_complete (current: ${job.status})`,
		)
	}
	await db.pdfIngestionJob.update({
		where: { id: job_id },
		data: { status: "pending", error: null },
	})
	const queueUrl =
		job.document_type === "mark_scheme"
			? Resource.MarkSchemePdfQueue.url
			: Resource.ExemplarQueue.url
	await sqs.send(
		new SendMessageCommand({
			QueueUrl: queueUrl,
			MessageBody: JSON.stringify({ job_id }),
		}),
	)
	return `Retriggered PDF ingestion job ${job_id}. It has been re-queued for processing.`
})
