import type { BatchStatus, StagedScriptStatus } from "@mcp-gcse/db"
import { z } from "zod"
import type { BatchProgress, JobEvent } from "./events"

export const pageKeySchema = z.object({
	s3_key: z.string(),
	order: z.number(),
	mime_type: z.string(),
	// Tolerated as missing for legacy rows that pre-date the fix in
	// `lib/batch/scripts/mutations.ts:pageKeySchema` — without this default
	// `parsePageKeys` would throw on those rows and `getActiveBatchForPaper`
	// would return null, blanking the staging panel.
	source_file: z.string().optional().default(""),
})

export type PageKey = z.infer<typeof pageKeySchema>

export function parsePageKeys(raw: unknown): PageKey[] {
	return z.array(pageKeySchema).parse(raw)
}

export type BatchIngestJobData = {
	id: string
	status: BatchStatus
	error: string | null
	staged_scripts: Array<{
		id: string
		page_keys: PageKey[]
		proposed_name: string | null
		confirmed_name: string | null
		confidence: number | null
		status: StagedScriptStatus
	}>
	student_jobs: Array<{
		id: string
		status: string
		student_name: string | null
		grading_results: unknown
		/** Links back to the staged script this job was created from. */
		staged_script_id: string | null
	}>
}

export type ActiveBatchInfo = {
	id: string
	status: BatchStatus
	staged_scripts: BatchIngestJobData["staged_scripts"]
	events: JobEvent[]
} | null

// ─── UI domain types ────────────────────────────────────────────────────────

export type StagedScript = {
	id: string
	page_keys: PageKey[]
	proposed_name: string | null
	confirmed_name: string | null
	confidence: number | null
	status: StagedScriptStatus
}

export type BatchIngestionState = {
	/** Processing phase visible to the teacher */
	phase: "classifying" | "staging" | "failed"
	isProcessing: boolean
	isReadyForReview: boolean
	isFailed: boolean

	batchId: string
	paperId: string

	/** All staged scripts for the current upload */
	allScripts: StagedScript[]
	/** Scripts not yet committed as submissions (status !== "submitted") */
	unsubmittedScripts: StagedScript[]

	/** Live progress derived from the handler's job_events stream. */
	progress: BatchProgress
}
