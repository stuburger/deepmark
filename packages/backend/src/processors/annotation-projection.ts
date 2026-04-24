import { db } from "@/db"
import type { AiAnnotationRecord } from "@/lib/collab/write-ai-annotations"
import { logger } from "@/lib/infra/logger"
import type { SqsEvent } from "@/lib/infra/sqs-job-runner"
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3"
import type { Prisma } from "@mcp-gcse/db"
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
 * Hocuspocus's Database extension. Decodes the Y.Doc, reads the
 * `ai-annotations` Y.Map, and projects it onto `student_paper_annotations`
 * rows with source="ai".
 *
 * Idempotent: each projection run replaces the submission's AI annotation
 * rows wholesale via delete+create in a single transaction.
 *
 * Stage isolation: document names are prefixed with the owning stage
 * (`${stage}:submission:${id}`). We skip records whose prefix doesn't match
 * the current STAGE env var — defense in depth against misrouted events.
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
	const parts = docName.split(":")
	if (parts.length !== 3) {
		logger.warn(TAG, "Invalid doc name", { docName })
		return
	}
	const [stage, kind, submissionId] = parts
	if (stage !== STAGE) {
		// Different stage's doc — skip cleanly.
		return
	}
	if (kind !== "submission") {
		logger.warn(TAG, "Unsupported doc kind", { kind, docName })
		return
	}

	const bytes = await downloadSnapshot(rec.s3.bucket.name, key)
	if (!bytes) {
		logger.warn(TAG, "No snapshot bytes", { key })
		return
	}

	const doc = new Y.Doc()
	try {
		Y.applyUpdate(doc, bytes)
		const aiMap = doc.getMap<AiAnnotationRecord>("ai-annotations")
		const records = Array.from(aiMap.values())

		await upsertAiAnnotations(submissionId, records)

		logger.info(TAG, "Projection complete", {
			submissionId,
			ai_count: records.length,
		})
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

async function upsertAiAnnotations(
	submissionId: string,
	records: AiAnnotationRecord[],
): Promise<void> {
	// Resolve grading_run_id from the latest run so rows have a back-reference
	// for compatibility with consumers that group by grading run.
	const latestGradingRun = await db.gradingRun.findFirst({
		where: { submission_id: submissionId },
		orderBy: { created_at: "desc" },
		select: { id: true },
	})
	const gradingRunId = latestGradingRun?.id ?? null

	await db.$transaction(async (tx) => {
		await tx.studentPaperAnnotation.deleteMany({
			where: { submission_id: submissionId, source: "ai" },
		})
		if (records.length === 0) return
		await tx.studentPaperAnnotation.createMany({
			data: records.map((r) => ({
				grading_run_id: gradingRunId,
				submission_id: submissionId,
				source: "ai" as const,
				question_id: r.questionId,
				page_order: r.pageOrder,
				overlay_type: r.overlayType,
				sentiment: r.sentiment,
				payload: r.payload as Prisma.InputJsonValue,
				anchor_token_start_id: r.anchorTokenStartId,
				anchor_token_end_id: r.anchorTokenEndId,
				bbox: r.bbox as Prisma.InputJsonValue,
				sort_order: r.sortOrder,
			})),
		})
	})
}
