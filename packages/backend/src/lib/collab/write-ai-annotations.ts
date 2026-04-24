import type { PendingAnnotation } from "@/lib/annotations/types"
import { logger } from "@/lib/infra/logger"
import { connectAndMutate } from "./headless-client"

const TAG = "collab-write-ai-annotations"

/**
 * Serialisable shape written to the Y.Doc's "ai-annotations" Y.Map. Mirrors
 * the DB row shape so the client can turn entries into PM marks with the
 * same token-anchor logic it already uses for DB-sourced annotations.
 *
 * Keyed by `${questionId}:${sortOrder}` — stable across re-runs of the same
 * grading pipeline, so idempotent writes don't duplicate entries.
 */
export type AiAnnotationRecord = {
	questionId: string
	pageOrder: number
	overlayType: "annotation" | "chain"
	sentiment: string
	payload: unknown
	anchorTokenStartId: string | null
	anchorTokenEndId: string | null
	bbox: unknown
	sortOrder: number
}

function keyFor(a: PendingAnnotation): string {
	return `${a.questionId}:${a.sortOrder}`
}

function toRecord(a: PendingAnnotation): AiAnnotationRecord {
	return {
		questionId: a.questionId,
		pageOrder: a.pageOrder,
		overlayType: a.overlayType,
		sentiment: a.sentiment,
		payload: a.payload,
		anchorTokenStartId: a.anchorTokenStartId,
		anchorTokenEndId: a.anchorTokenEndId,
		bbox: a.bbox,
		sortOrder: a.sortOrder,
	}
}

/**
 * Writes AI annotations to the submission's Y.Doc on the Hocuspocus server.
 *
 * Best-effort: any failure (Hocuspocus unreachable, auth failure, timeout)
 * is logged and swallowed — DB persistence is the authoritative path today
 * and the K-7 projection Lambda will re-derive from Y.Doc later.
 *
 * Called from the grading processor after `persistAnnotations` succeeds.
 * On re-runs of grading the same `${questionId}:${sortOrder}` keys are
 * overwritten, so no duplicates accumulate in the map.
 */
export async function writeAiAnnotationsToYDoc(args: {
	submissionId: string
	annotationsByQuestion: Map<string, PendingAnnotation[]>
}): Promise<{ ok: true; written: number } | { ok: false; error: string }> {
	const allAnnotations: PendingAnnotation[] = []
	for (const group of args.annotationsByQuestion.values()) {
		allAnnotations.push(...group)
	}

	if (allAnnotations.length === 0) {
		return { ok: true, written: 0 }
	}

	try {
		await connectAndMutate(args.submissionId, (doc) => {
			const map = doc.getMap<AiAnnotationRecord>("ai-annotations")
			for (const a of allAnnotations) {
				map.set(keyFor(a), toRecord(a))
			}
		})
		logger.info(TAG, "AI annotations written to Y.Doc", {
			submissionId: args.submissionId,
			count: allAnnotations.length,
		})
		return { ok: true, written: allAnnotations.length }
	} catch (err) {
		const error = err instanceof Error ? err.message : String(err)
		logger.warn(TAG, "Failed to write AI annotations to Y.Doc", {
			submissionId: args.submissionId,
			error,
		})
		return { ok: false, error }
	}
}
