import { db } from "@/db"
import { loadEnrichmentData } from "@/lib/enrichment/data-loading"
import {
	deterministicMcqAnnotation,
	pointBasedAnnotations,
} from "@/lib/enrichment/deterministic-annotations"
import { annotateOneQuestion } from "@/lib/enrichment/llm-annotations"
import { persistAnnotations } from "@/lib/enrichment/persist-annotations"
import type { PendingAnnotation } from "@/lib/enrichment/types"
import { createLlmRunner } from "@/lib/infra/llm-runtime"
import { logger } from "@/lib/infra/logger"
import { type SqsEvent, parseSqsJobId } from "@/lib/infra/sqs-job-runner"
import type { EnrichmentStatus } from "@mcp-gcse/db"

const TAG = "student-paper-enrich"

/**
 * Enrichment handler: generates inline annotations for a graded student paper.
 *
 * For each graded question, either produces deterministic tick/cross annotations
 * (point_based, MCQ) or calls Gemini for rich annotations (level_of_response).
 */
export async function handler(
	event: SqsEvent,
): Promise<{ batchItemFailures?: { itemIdentifier: string }[] }> {
	const failures: { itemIdentifier: string }[] = []

	for (const record of event.Records) {
		const jobId = parseSqsJobId(record, TAG)
		if (!jobId) continue

		let enrichmentRunId: string | null = null

		try {
			logger.info(TAG, "Enrich job received", {
				jobId,
				messageId: record.messageId,
			})

			const enrichmentRun = await db.enrichmentRun.create({
				data: {
					grading_run_id: jobId,
					status: "processing" satisfies EnrichmentStatus,
				},
			})
			enrichmentRunId = enrichmentRun.id

			// ── Load all data ─────────────────────────────────────────────────

			const data = await loadEnrichmentData(jobId)
			if (!data) {
				logger.warn(TAG, "No grading results — skipping enrichment", { jobId })
				await db.enrichmentRun.update({
					where: { id: enrichmentRun.id },
					data: {
						status: "complete" satisfies EnrichmentStatus,
						completed_at: new Date(),
					},
				})
				continue
			}

			const {
				gradingResults,
				allTokens,
				regionByQuestion,
				markSchemeMap,
				examBoard,
				levelDescriptors,
				subject,
			} = data
			const llm = createLlmRunner()

			// ── Deterministic annotations (no LLM) ───────────────────────────

			const deterministicGroups: PendingAnnotation[][] = []
			const lorGradingResults: typeof gradingResults = []

			for (const result of gradingResults) {
				const method =
					result.marking_method ??
					(result.mark_scheme_id
						? (markSchemeMap.get(result.mark_scheme_id)?.marking_method ?? null)
						: null)
				const region = regionByQuestion.get(result.question_id)

				if (method === "point_based") {
					const annotations = pointBasedAnnotations(result, region)
					if (annotations.length > 0) deterministicGroups.push(annotations)
				} else if (method === "deterministic") {
					const annotations = deterministicMcqAnnotation(result, region)
					if (annotations.length > 0) deterministicGroups.push(annotations)
				} else {
					lorGradingResults.push(result)
				}
			}

			// ── LLM annotations (Gemini) — LoR questions only ────────────────

			const questionResults = await Promise.allSettled(
				lorGradingResults.map((result) =>
					annotateOneQuestion({
						gradingResult: result,
						allTokens,
						examBoard,
						levelDescriptors,
						subject,
						markScheme: result.mark_scheme_id
							? (markSchemeMap.get(result.mark_scheme_id) ?? null)
							: null,
						llm,
						jobId,
					}),
				),
			)

			const perQuestionGroups: PendingAnnotation[][] = [...deterministicGroups]
			let questionsSucceeded = deterministicGroups.length

			for (const qResult of questionResults) {
				if (qResult.status === "fulfilled" && qResult.value) {
					perQuestionGroups.push(qResult.value)
					questionsSucceeded++
				} else if (qResult.status === "rejected") {
					logger.warn(TAG, "Annotation failed for one question", {
						jobId,
						error: String(qResult.reason),
					})
				}
			}

			// ── Persist & complete ────────────────────────────────────────────

			const totalAnnotations = await persistAnnotations(
				enrichmentRun.id,
				jobId,
				perQuestionGroups,
			)

			await db.enrichmentRun.update({
				where: { id: enrichmentRun.id },
				data: {
					status: "complete" satisfies EnrichmentStatus,
					llm_snapshot: llm.toSnapshot(),
					completed_at: new Date(),
				},
			})

			logger.info(TAG, "Enrich job complete", {
				jobId,
				annotations: totalAnnotations,
				questions: questionsSucceeded,
			})
		} catch (err) {
			logger.error(TAG, "Enrich job failed", {
				jobId,
				error: String(err),
			})
			if (enrichmentRunId) {
				db.enrichmentRun
					.update({
						where: { id: enrichmentRunId },
						data: {
							status: "failed" satisfies EnrichmentStatus,
							error: String(err),
						},
					})
					.catch(() => {})
			}
			failures.push({ itemIdentifier: record.messageId })
		}
	}

	return failures.length > 0 ? { batchItemFailures: failures } : {}
}
