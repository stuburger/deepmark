import { db } from "@/db"
import { logger } from "@/lib/infra/logger"
import type { SqsEvent, SqsRecord } from "@/lib/infra/sqs-job-runner"
import { appendJobEvent } from "@/lib/script-ingestion/job-events"
import {
	listSourceFiles,
	processSourceFile,
} from "@/lib/script-ingestion/source-file-processing"
import type { StagedScriptData } from "@/lib/script-ingestion/types"
import type { BatchStatus, StagedScriptStatus } from "@mcp-gcse/db"
import type { Context } from "aws-lambda"
import { z } from "zod/v4"

const TAG = "batch-classify"

const MessageBodySchema = z.object({
	batch_ingest_job_id: z.string().min(1),
})

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function handler(
	event: SqsEvent,
	context?: Context,
): Promise<{ batchItemFailures?: { itemIdentifier: string }[] }> {
	const failures: { itemIdentifier: string }[] = []
	// AWS passes a Context object with `getRemainingTimeInMillis` whenever
	// this runs inside Lambda. Wrap it as a closure so downstream callees
	// can be Lambda-runtime-agnostic and just see "ms remaining".
	const getRemainingTimeMs = context
		? () => context.getRemainingTimeInMillis()
		: undefined

	for (const record of event.Records) {
		const batchJobId = parseBatchJobId(record)
		if (!batchJobId) continue

		try {
			await classifyBatch(batchJobId, { getRemainingTimeMs })
		} catch (err) {
			const errMsg =
				err instanceof Error
					? `${err.message}\n${err.stack ?? ""}`
					: String(err)
			logger.error(TAG, "Batch classification failed", {
				batchJobId,
				error: errMsg,
			})
			const reason = err instanceof Error ? err.message : String(err)
			await db.batchIngestJob
				.update({
					where: { id: batchJobId },
					data: { status: "failed" as BatchStatus, error: reason },
				})
				.catch(() => {})
			await appendJobEvent(batchJobId, { kind: "failed", reason })
			failures.push({ itemIdentifier: record.messageId })
		}
	}

	return failures.length > 0 ? { batchItemFailures: failures } : {}
}

function parseBatchJobId(record: SqsRecord): string | null {
	const parsed = MessageBodySchema.safeParse(JSON.parse(record.body))
	if (!parsed.success) {
		logger.warn(TAG, "Invalid message body", {
			messageId: record.messageId,
			error: parsed.error.message,
		})
		return null
	}
	return parsed.data.batch_ingest_job_id
}

// ─── Core classification logic ────────────────────────────────────────────────

async function classifyBatch(
	batchJobId: string,
	opts: { getRemainingTimeMs?: () => number } = {},
): Promise<void> {
	logger.info(TAG, "Starting batch classification", { batchJobId })

	await db.batchIngestJob.update({
		where: { id: batchJobId },
		data: { status: "classifying" as BatchStatus },
	})
	await appendJobEvent(batchJobId, { kind: "started" })

	const sourceKeys = await listSourceFiles(batchJobId)
	logger.info(TAG, "Source files found", {
		batchJobId,
		count: sourceKeys.length,
	})

	const allStagedScripts: StagedScriptData[] = []
	for (const sourceKey of sourceKeys) {
		const { scripts } = await processSourceFile(batchJobId, sourceKey, {
			getRemainingTimeMs: opts.getRemainingTimeMs,
		})
		allStagedScripts.push(...scripts)
	}

	await db.stagedScript.createMany({
		data: allStagedScripts.map((s) => ({
			batch_job_id: batchJobId,
			page_keys: s.page_keys,
			proposed_name: s.proposed_name,
			confidence: s.confidence,
			status: "excluded" as StagedScriptStatus,
		})),
	})

	await db.batchIngestJob.update({
		where: { id: batchJobId },
		data: { status: "staging" as BatchStatus },
	})
	await appendJobEvent(batchJobId, {
		kind: "complete",
		totalScripts: allStagedScripts.length,
	})

	logger.info(TAG, "Batch classification complete", {
		batchJobId,
		scriptCount: allStagedScripts.length,
	})
}
