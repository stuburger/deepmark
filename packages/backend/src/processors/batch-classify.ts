import { db } from "@/db"
import { logger } from "@/lib/infra/logger"
import { autoCommitBatch } from "@/lib/script-ingestion/auto-commit"
import {
	listSourceFiles,
	processSourceFile,
	processSourceFilePerFile,
} from "@/lib/script-ingestion/source-file-processing"
import type { StagedScriptData } from "@/lib/script-ingestion/types"
import { scriptCountIsPlausible } from "@/lib/script-ingestion/utils"
import type { SqsEvent, SqsRecord } from "@/lib/infra/sqs-job-runner"
import type {
	BatchStatus,
	ClassificationMode,
	StagedScriptStatus,
} from "@mcp-gcse/db"

const TAG = "batch-classify"
const AUTO_COMMIT_THRESHOLD = 0.9

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
	const body = JSON.parse(record.body) as { batch_job_id?: string }
	if (!body.batch_job_id) {
		logger.warn(TAG, "Message missing batch_job_id", {
			messageId: record.messageId,
		})
		return null
	}
	return body.batch_job_id
}

// ─── Core classification logic ────────────────────────────────────────────────

async function classifyBatch(batchJobId: string): Promise<void> {
	logger.info(TAG, "Starting batch classification", { batchJobId })

	const batch = await db.batchIngestJob.findUniqueOrThrow({
		where: { id: batchJobId },
		select: {
			id: true,
			review_mode: true,
			blank_page_mode: true,
			pages_per_script: true,
			classification_mode: true,
			exam_paper: {
				select: {
					id: true,
					title: true,
					exam_board: true,
					subject: true,
					year: true,
				},
			},
		},
	})

	await db.batchIngestJob.update({
		where: { id: batchJobId },
		data: { status: "classifying" as BatchStatus },
	})

	const sourceKeys = await listSourceFiles(batchJobId)
	logger.info(TAG, "Source files found", {
		batchJobId,
		count: sourceKeys.length,
		classificationMode: batch.classification_mode,
	})

	const allStagedScripts: StagedScriptData[] = []
	let totalPages = 0

	if (batch.classification_mode === ("per_file" as ClassificationMode)) {
		for (const sourceKey of sourceKeys) {
			const { scripts, pageCount } = await processSourceFilePerFile(
				batchJobId,
				sourceKey,
				batch.pages_per_script,
			)
			allStagedScripts.push(...scripts)
			totalPages += pageCount
		}
	} else {
		for (const sourceKey of sourceKeys) {
			const { scripts, pageCount } = await processSourceFile(
				batchJobId,
				sourceKey,
				batch.blank_page_mode,
			)
			allStagedScripts.push(...scripts)
			totalPages += pageCount
		}
	}

	// Persist staged scripts
	await db.stagedScript.createMany({
		data: allStagedScripts.map((s) => ({
			batch_job_id: batchJobId,
			page_keys: s.page_keys,
			proposed_name: s.proposed_name,
			confidence: s.confidence,
			status: "excluded" as StagedScriptStatus,
		})),
	})

	// Decide: auto-commit or stage for review
	const shouldAutoCommit = evaluateAutoCommit(
		batch,
		allStagedScripts,
		totalPages,
	)

	if (shouldAutoCommit) {
		logger.info(TAG, "Auto-committing batch", {
			batchJobId,
			scriptCount: allStagedScripts.length,
		})
		await autoCommitBatch(batchJobId, batch.exam_paper)
	} else {
		await db.batchIngestJob.update({
			where: { id: batchJobId },
			data: { status: "staging" as BatchStatus },
		})
	}

	logger.info(TAG, "Batch classification complete", {
		batchJobId,
		scriptCount: allStagedScripts.length,
		classificationMode: batch.classification_mode,
	})
}

function evaluateAutoCommit(
	batch: {
		review_mode: string
		classification_mode: ClassificationMode
		pages_per_script: number
	},
	scripts: StagedScriptData[],
	totalPages: number,
): boolean {
	if (batch.review_mode !== "auto" || scripts.length === 0) return false

	if (batch.classification_mode === ("per_file" as ClassificationMode)) {
		return !scripts.some((s) => s.hasUncertainPage)
	}

	return (
		scripts.every((s) => s.confidence >= AUTO_COMMIT_THRESHOLD) &&
		!scripts.some((s) => s.hasUncertainPage) &&
		scriptCountIsPlausible(scripts.length, batch.pages_per_script, totalPages)
	)
}
