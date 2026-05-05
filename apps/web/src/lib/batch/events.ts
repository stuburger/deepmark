import { z } from "zod"

/**
 * Streaming progress events written by the batch-classify Lambda to
 * `BatchIngestJob.job_events` (JSONB array). The handler appends an event
 * at each meaningful step; the UI polls and renders a live progress card.
 *
 * Backend mirror: `packages/backend/src/lib/script-ingestion/job-events.ts`.
 * Keep the two in lockstep — the wire contract is this Zod schema.
 */
export const jobEventSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("started"), at: z.string() }),
	z.object({
		kind: z.literal("source_file_started"),
		at: z.string(),
		sourceKey: z.string(),
		totalPages: z.number().int().nonnegative(),
	}),
	z.object({
		kind: z.literal("pages_extracted"),
		at: z.string(),
		sourceKey: z.string(),
		processed: z.number().int().nonnegative(),
		total: z.number().int().nonnegative(),
	}),
	z.object({
		kind: z.literal("vision_progress"),
		at: z.string(),
		sourceKey: z.string(),
		processed: z.number().int().nonnegative(),
		total: z.number().int().nonnegative(),
	}),
	z.object({
		kind: z.literal("segmentation_complete"),
		at: z.string(),
		sourceKey: z.string(),
		scriptCount: z.number().int().nonnegative(),
	}),
	z.object({
		kind: z.literal("complete"),
		at: z.string(),
		totalScripts: z.number().int().nonnegative(),
	}),
	z.object({
		kind: z.literal("failed"),
		at: z.string(),
		reason: z.string(),
	}),
])

export type JobEvent = z.infer<typeof jobEventSchema>

export function parseJobEvents(raw: unknown): JobEvent[] {
	if (raw == null) return []
	return z.array(jobEventSchema).parse(raw)
}

// ─── Display state derivation ───────────────────────────────────────────────

export type SourceFilePhase = "extract" | "extract_done" | "ocr" | "done"

export type SourceFileProgress = {
	sourceKey: string
	totalPages: number
	pagesExtracted: number
	pagesOcrd: number
	currentPhase: SourceFilePhase
	scriptCount: number | null
}

export type BatchStep =
	| "idle"
	| "started"
	| "extracting"
	| "ocr"
	| "complete"
	| "failed"

export type BatchProgress = {
	currentStep: BatchStep
	sourceFiles: SourceFileProgress[]
	totalScripts: number | null
	failureReason: string | undefined
}

/**
 * Pure reducer: collapses the append-only event log into the latest UI state.
 * Source files are listed in the order their `source_file_started` events
 * arrived; per-file progress is tracked independently.
 */
export function deriveProgress(events: JobEvent[]): BatchProgress {
	const sourceFiles = new Map<string, SourceFileProgress>()
	let currentStep: BatchStep = "idle"
	let totalScripts: number | null = null
	let failureReason: string | undefined

	for (const event of events) {
		switch (event.kind) {
			case "started":
				if (currentStep === "idle") currentStep = "started"
				break

			case "source_file_started":
				sourceFiles.set(event.sourceKey, {
					sourceKey: event.sourceKey,
					totalPages: event.totalPages,
					pagesExtracted: 0,
					pagesOcrd: 0,
					currentPhase: "extract",
					scriptCount: null,
				})
				if (currentStep === "started" || currentStep === "idle") {
					currentStep = "extracting"
				}
				break

			case "pages_extracted": {
				const f = sourceFiles.get(event.sourceKey)
				if (!f) break
				f.pagesExtracted = event.processed
				if (event.processed >= event.total) f.currentPhase = "extract_done"
				break
			}

			case "vision_progress": {
				const f = sourceFiles.get(event.sourceKey)
				if (!f) break
				f.pagesOcrd = event.processed
				f.currentPhase = "ocr"
				if (currentStep !== "complete" && currentStep !== "failed") {
					currentStep = "ocr"
				}
				break
			}

			case "segmentation_complete": {
				const f = sourceFiles.get(event.sourceKey)
				if (!f) break
				f.currentPhase = "done"
				f.scriptCount = event.scriptCount
				break
			}

			case "complete":
				currentStep = "complete"
				totalScripts = event.totalScripts
				break

			case "failed":
				currentStep = "failed"
				failureReason = event.reason
				break
		}
	}

	return {
		currentStep,
		sourceFiles: Array.from(sourceFiles.values()),
		totalScripts,
		failureReason,
	}
}
