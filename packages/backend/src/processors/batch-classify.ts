import { db } from "@/db"
import { logger } from "@/lib/infra/logger"
import type { SqsEvent, SqsRecord } from "@/lib/infra/sqs-job-runner"
import {
	listSourceFiles,
	processSourceFile,
} from "@/lib/script-ingestion/source-file-processing"
import type { StagedScriptData } from "@/lib/script-ingestion/types"
import type { BatchStatus, StagedScriptStatus } from "@mcp-gcse/db"
import { z } from "zod/v4"

const TAG = "batch-classify"

const MessageBodySchema = z.object({
	batch_job_id: z.string().min(1),
})

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function handler(
	event: SqsEvent,
): Promise<{ batchItemFailures?: { itemIdentifier: string }[] }> {
	const failures: { itemIdentifier: string }[] = []

	for (const record of event.Records) {
		const batchJobId = parseBatchJobId(record)
		if (!batchJobId) continue

		try {
			await classifyBatch(batchJobId)
		} catch (err) {
			const errMsg =
				err instanceof Error
					? `${err.message}\n${err.stack ?? ""}`
					: String(err)
			logger.error(TAG, "Batch classification failed", {
				batchJobId,
				error: errMsg,
			})
			await db.batchIngestJob
				.update({
					where: { id: batchJobId },
					data: {
						status: "failed" as BatchStatus,
						error: err instanceof Error ? err.message : String(err),
					},
				})
				.catch(() => {})
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
	return parsed.data.batch_job_id
}

// ─── Core classification logic ────────────────────────────────────────────────

async function classifyBatch(batchJobId: string): Promise<void> {
	logger.info(TAG, "Starting batch classification", { batchJobId })

	await db.batchIngestJob.update({
		where: { id: batchJobId },
		data: { status: "classifying" as BatchStatus },
	})

	const sourceKeys = await listSourceFiles(batchJobId)
	logger.info(TAG, "Source files found", {
		batchJobId,
		count: sourceKeys.length,
	})

	const allStagedScripts: StagedScriptData[] = []
	for (const sourceKey of sourceKeys) {
		const { scripts } = await processSourceFile(batchJobId, sourceKey)
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

	logger.info(TAG, "Batch classification complete", {
		batchJobId,
		scriptCount: allStagedScripts.length,
	})
}
