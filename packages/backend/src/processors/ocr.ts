import { db } from "@/db"
import { runOcr } from "@/lib/gemini-ocr"
import { logger } from "@/lib/logger"
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs"
import { ScanStatus } from "@mcp-gcse/db"
import { Resource } from "sst"

const TAG = "ocr"
const s3 = new S3Client({})
const sqs = new SQSClient({})

interface S3Record {
	s3: {
		bucket: { name: string }
		object: { key: string }
	}
}

interface SqsRecord {
	messageId: string
	body: string
}

interface SqsEvent {
	Records: SqsRecord[]
}

function parseS3Key(key: string): {
	scanSubmissionId: string
	pageNumber: number
} {
	const decoded = decodeURIComponent(key)
	const parts = decoded.split("/")
	if (parts.length < 3 || parts[0] !== "scans") {
		throw new Error(`Unexpected S3 key format: ${key}`)
	}
	const scanSubmissionId = parts[1]
	const filename = parts[2]
	const pageNumber = Number.parseInt(filename.split(".")[0] ?? "0", 10)
	if (Number.isNaN(pageNumber)) {
		throw new Error(`Could not parse page number from key: ${key}`)
	}
	return { scanSubmissionId, pageNumber }
}

export async function handler(
	event: SqsEvent,
): Promise<{ batchItemFailures?: { itemIdentifier: string }[] }> {
	const failures: { itemIdentifier: string }[] = []

	for (const record of event.Records) {
		const messageId = record.messageId
		try {
			logger.info(TAG, "Message received", { messageId })
			const s3Event = JSON.parse(record.body) as { Records?: S3Record[] }
			const s3Records = s3Event.Records ?? []
			for (const s3Record of s3Records) {
				const bucket = s3Record.s3.bucket.name
				const key = s3Record.s3.object.key
				const { scanSubmissionId, pageNumber } = parseS3Key(key)

				logger.info(TAG, "Processing page", { scanSubmissionId, pageNumber })

				const page = await db.scanPage.findFirst({
					where: {
						scan_submission_id: scanSubmissionId,
						page_number: pageNumber,
					},
					include: { scan_submission: true },
				})
				if (!page) {
					logger.warn(TAG, "No ScanPage found for key — skipping", { key })
					continue
				}

				await db.scanPage.update({
					where: { id: page.id },
					data: { ocr_status: ScanStatus.processing },
				})

				try {
					const getCmd = new GetObjectCommand({ Bucket: bucket, Key: key })
					const response = await s3.send(getCmd)
					const body = await response.Body?.transformToByteArray()
					if (!body?.length) {
						throw new Error("Empty S3 object")
					}
					const base64 = Buffer.from(body).toString("base64")
					const mimeType = key.endsWith(".png") ? "image/png" : "image/jpeg"

					logger.info(TAG, "Calling Gemini OCR", {
						scanSubmissionId,
						pageNumber,
						mimeType,
					})
					const analysis = await runOcr(base64, mimeType)

					await db.scanPage.update({
						where: { id: page.id },
						data: {
							ocr_status: ScanStatus.ocr_complete,
							ocr_result: analysis as unknown as object,
							processed_at: new Date(),
							error_message: null,
						},
					})
					logger.info(TAG, "OCR complete for page", {
						scanSubmissionId,
						pageNumber,
					})

					const allPages = await db.scanPage.findMany({
						where: { scan_submission_id: scanSubmissionId },
						select: { ocr_status: true },
					})
					const allComplete = allPages.every(
						(p) => p.ocr_status === ScanStatus.ocr_complete,
					)
					if (allComplete) {
						logger.info(TAG, "All pages complete — triggering extraction", {
							scanSubmissionId,
							page_count: allPages.length,
						})
						await db.scanSubmission.update({
							where: { id: scanSubmissionId },
							data: { status: ScanStatus.ocr_complete },
						})
						const submission = await db.scanSubmission.findUnique({
							where: { id: scanSubmissionId },
							select: { exam_paper_id: true },
						})
						if (submission?.exam_paper_id) {
							await sqs.send(
								new SendMessageCommand({
									QueueUrl: Resource.ExtractionQueue.url,
									MessageBody: JSON.stringify({
										scan_submission_id: scanSubmissionId,
									}),
								}),
							)
						}
					}
				} catch (err) {
					logger.error(TAG, "OCR failed for page", {
						scanSubmissionId,
						pageNumber,
						error: String(err),
					})
					const message = err instanceof Error ? err.message : String(err)
					await db.scanPage.update({
						where: { id: page.id },
						data: {
							ocr_status: ScanStatus.failed,
							error_message: message,
							processed_at: new Date(),
						},
					})
					throw err
				}
			}
		} catch (err) {
			logger.error(TAG, "Message processing failed", {
				messageId,
				error: String(err),
			})
			failures.push({ itemIdentifier: messageId })
		}
	}

	return failures.length > 0 ? { batchItemFailures: failures } : {}
}
