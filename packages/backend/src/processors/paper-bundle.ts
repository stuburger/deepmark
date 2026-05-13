import { db } from "@/db"
import { llmTimeoutFromContext } from "@/lib/infra/lambda-envelope"
import { callLlmWithFallback } from "@/lib/infra/llm-runtime"
import { logger } from "@/lib/infra/logger"
import { outputSchema } from "@/lib/infra/output-schema"
import { getPdfBase64 } from "@/lib/infra/processor-s3"
import type { SqsEvent, SqsRecord } from "@/lib/infra/sqs-job-runner"
import {
	CopyObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3"
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs"
import { generateText } from "ai"
import { Resource } from "sst"
import type { Context } from "aws-lambda"
import { promoteSessionToExamPaper } from "./paper-bundle/persist"
import { PAPER_BUNDLE_PROMPT } from "./paper-bundle/prompts"
import {
	PaperBundleJobPayloadSchema,
	PaperBundleSchema,
} from "./paper-bundle/schema"
import { validateBundle } from "./paper-bundle/validate"

const TAG = "paper-bundle"
const s3 = new S3Client({})
const sqs = new SQSClient({})

// Combined QP + MS PDFs above this size strongly imply the wrong files —
// Gemini will either OOM the Lambda or time out. Fail fast rather than burn
// money on a doomed retry loop.
const MAX_COMBINED_PDF_BYTES = 30 * 1024 * 1024

export async function handler(
	event: SqsEvent,
	context?: Context,
): Promise<{ batchItemFailures?: { itemIdentifier: string }[] }> {
	const failures: { itemIdentifier: string }[] = []
	const timeoutMs = llmTimeoutFromContext(context)

	for (const record of event.Records) {
		const messageId = record.messageId
		let sessionId: string | null = null
		try {
			logger.info(TAG, "Message received", { messageId })
			const payload = PaperBundleJobPayloadSchema.parse(JSON.parse(record.body))
			sessionId = payload.sessionId

			const session = await db.paperSetupSession.findUniqueOrThrow({
				where: { id: sessionId },
				include: {
					staged_files: true,
					created_by: { select: { email: true } },
				},
			})

			if (session.status === "completed" && session.exam_paper_id) {
				logger.info(TAG, "Session already promoted — skipping", {
					sessionId,
					examPaperId: session.exam_paper_id,
				})
				continue
			}

			const qpFile = session.staged_files.find(
				(f) => f.kind === "question_paper",
			)
			const msFile = session.staged_files.find((f) => f.kind === "mark_scheme")
			if (!qpFile || !msFile) {
				await failSession(
					sessionId,
					"Bundle requires both a question paper and a mark scheme.",
				)
				continue
			}

			logger.info(TAG, "Fetching PDFs from S3", {
				sessionId,
				qpKey: qpFile.s3_key,
				msKey: msFile.s3_key,
			})

			const [qpBase64, msBase64] = await Promise.all([
				getPdfBase64(qpFile.s3_bucket, qpFile.s3_key),
				getPdfBase64(msFile.s3_bucket, msFile.s3_key),
			])

			const combinedBytes =
				Buffer.byteLength(qpBase64, "base64") +
				Buffer.byteLength(msBase64, "base64")
			if (combinedBytes > MAX_COMBINED_PDF_BYTES) {
				const error = `Combined PDF size ${combinedBytes} bytes exceeds limit ${MAX_COMBINED_PDF_BYTES}`
				logger.warn(TAG, error, { sessionId })
				await failSession(sessionId, error)
				continue
			}

			logger.info(TAG, "Calling LLM for combined extraction", {
				sessionId,
				timeoutMs,
			})

			const result = await callLlmWithFallback(
				"paper-bundle-extraction",
				async (model, entry, report) => {
					const r = await generateText({
						model,
						temperature: entry.temperature,
						messages: [
							{
								role: "user",
								content: [
									{
										type: "file",
										data: qpBase64,
										mediaType: "application/pdf",
									},
									{
										type: "file",
										data: msBase64,
										mediaType: "application/pdf",
									},
									{ type: "text", text: PAPER_BUNDLE_PROMPT },
								],
							},
						],
						output: outputSchema(PaperBundleSchema),
					})
					report.usage = r.usage
					return r
				},
				{ timeoutMs },
			)

			const bundle = result.output

			const validation = validateBundle(bundle)
			if (!validation.ok) {
				logger.warn(TAG, "Bundle validation failed", {
					sessionId,
					error: validation.error,
				})
				await failSession(sessionId, validation.error)
				continue
			}

			const promotion = await promoteSessionToExamPaper(
				bundle,
				session,
				session.created_by.email ?? "",
			)

			logger.info(TAG, "Session promoted to ExamPaper", {
				sessionId,
				examPaperId: promotion.examPaperId,
				questionCount: promotion.questionCount,
			})

			// If the teacher dropped a scripts PDF alongside QP + MS, kick off
			// the existing batch-classify flow now that the ExamPaper exists.
			// Same shape as the shell-driven upload — create BatchIngestJob,
			// copy the staged PDF into batches/{batchJobId}/source/, dispatch.
			const scriptsFile = session.staged_files.find(
				(f) => f.kind === "scripts_bundle",
			)
			if (scriptsFile) {
				try {
					await dispatchScriptsBatch({
						examPaperId: promotion.examPaperId,
						uploadedBy: session.created_by_id,
						sourceBucket: scriptsFile.s3_bucket,
						sourceKey: scriptsFile.s3_key,
						filename: scriptsFile.filename,
					})
					logger.info(TAG, "Scripts batch dispatched", {
						sessionId,
						examPaperId: promotion.examPaperId,
					})
				} catch (err) {
					// Don't fail the session — the paper itself is fine. Surface in
					// logs; the teacher can re-upload via the shell page.
					logger.error(TAG, "Scripts batch dispatch failed", {
						sessionId,
						examPaperId: promotion.examPaperId,
						error: err instanceof Error ? err.message : String(err),
					})
				}
			}
		} catch (err) {
			logger.error(TAG, "Handler threw", { error: String(err) })
			const message = err instanceof Error ? err.message : String(err)
			if (sessionId) {
				await failSession(sessionId, message)
			} else {
				await failSessionFromRecord(record, message)
			}
			failures.push({ itemIdentifier: messageId })
		}
	}

	return failures.length > 0 ? { batchItemFailures: failures } : {}
}

async function failSession(sessionId: string, error: string): Promise<void> {
	try {
		await db.paperSetupSession.update({
			where: { id: sessionId },
			data: { status: "failed", error },
		})
	} catch {
		// swallow — never mask the original error path
	}
}

async function failSessionFromRecord(
	record: SqsRecord,
	error: string,
): Promise<void> {
	try {
		const parsed = JSON.parse(record.body) as { sessionId?: string }
		if (parsed.sessionId) await failSession(parsed.sessionId, error)
	} catch {
		// ignore
	}
}

/**
 * Creates a BatchIngestJob, copies the staged scripts PDF into the
 * batch's source prefix, and sends a message to BatchClassifyQueue.
 * Mirrors the existing shell-driven flow (createBatchIngestJob +
 * addFileToBatch + triggerClassification) without the per-step
 * presigned-URL round trip.
 */
async function dispatchScriptsBatch(opts: {
	examPaperId: string
	uploadedBy: string
	sourceBucket: string
	sourceKey: string
	filename: string
}): Promise<void> {
	const batch = await db.batchIngestJob.create({
		data: {
			exam_paper_id: opts.examPaperId,
			uploaded_by: opts.uploadedBy,
			status: "classifying",
		},
	})

	const destKey = `batches/${batch.id}/source/${opts.filename}`
	await s3.send(
		new CopyObjectCommand({
			Bucket: opts.sourceBucket,
			CopySource: `${opts.sourceBucket}/${opts.sourceKey}`,
			Key: destKey,
			ContentType: "application/pdf",
		}),
	)

	await sqs.send(
		new SendMessageCommand({
			QueueUrl: Resource.BatchClassifyQueue.url,
			MessageBody: JSON.stringify({ batch_ingest_job_id: batch.id }),
		}),
	)
}
