import { db } from "@/db"
import { llmTimeoutFromContext } from "@/lib/infra/lambda-envelope"
import { callLlmWithFallback } from "@/lib/infra/llm-runtime"
import { logger } from "@/lib/infra/logger"
import { outputSchema } from "@/lib/infra/output-schema"
import { getPdfBase64 } from "@/lib/infra/processor-s3"
import type { SqsEvent, SqsRecord } from "@/lib/infra/sqs-job-runner"
import { generateText } from "ai"
import type { Context } from "aws-lambda"
import { promoteSessionToExamPaper } from "./paper-bundle/persist"
import { PAPER_BUNDLE_PROMPT } from "./paper-bundle/prompts"
import {
	PaperBundleJobPayloadSchema,
	PaperBundleSchema,
} from "./paper-bundle/schema"
import { validateBundle } from "./paper-bundle/validate"

const TAG = "paper-bundle"

// Combined QP + MS (+ optional stimulus pack) PDFs above this size strongly
// imply the wrong files — Gemini will either OOM the Lambda or time out. Fail
// fast rather than burn money on a doomed retry loop. Stimulus packs add up
// to ~5 MB; the headroom over the original 30 MB QP+MS cap covers that with
// margin.
const MAX_COMBINED_PDF_BYTES = 40 * 1024 * 1024

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

			if (session.exam_paper_id) {
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
			const stimFile = session.staged_files.find(
				(f) => f.kind === "stimulus_pack",
			)
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
				stimulusKey: stimFile?.s3_key ?? null,
			})

			const [qpBase64, msBase64, stimBase64] = await Promise.all([
				getPdfBase64(qpFile.s3_bucket, qpFile.s3_key),
				getPdfBase64(msFile.s3_bucket, msFile.s3_key),
				stimFile
					? getPdfBase64(stimFile.s3_bucket, stimFile.s3_key)
					: Promise.resolve<string | null>(null),
			])

			const combinedBytes =
				Buffer.byteLength(qpBase64, "base64") +
				Buffer.byteLength(msBase64, "base64") +
				(stimBase64 ? Buffer.byteLength(stimBase64, "base64") : 0)
			if (combinedBytes > MAX_COMBINED_PDF_BYTES) {
				const error = `Combined PDF size ${combinedBytes} bytes exceeds limit ${MAX_COMBINED_PDF_BYTES}`
				logger.warn(TAG, error, { sessionId })
				await failSession(sessionId, error)
				continue
			}

			logger.info(TAG, "Calling LLM for combined extraction", {
				sessionId,
				timeoutMs,
				hasStimulus: stimBase64 !== null,
			})

			const result = await callLlmWithFallback(
				"paper-bundle-extraction",
				async (model, entry, report) => {
					const content: Array<
						| { type: "file"; data: string; mediaType: "application/pdf" }
						| { type: "text"; text: string }
					> = [
						{ type: "file", data: qpBase64, mediaType: "application/pdf" },
						{ type: "file", data: msBase64, mediaType: "application/pdf" },
					]
					if (stimBase64) {
						content.push({
							type: "file",
							data: stimBase64,
							mediaType: "application/pdf",
						})
					}
					content.push({ type: "text", text: PAPER_BUNDLE_PROMPT })

					const r = await generateText({
						model,
						temperature: entry.temperature,
						messages: [{ role: "user", content }],
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
			// The scripts batch (if any) is dispatched in parallel from
			// createPaperFromStaged with paper_setup_session_id set and
			// exam_paper_id null. promoteSessionToExamPaper stitches the FK.
			// Nothing else for this handler to do.
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
			data: { error },
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
