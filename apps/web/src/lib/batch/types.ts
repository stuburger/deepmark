import type { BatchStatus, StagedScriptStatus } from "@mcp-gcse/db"
import { z } from "zod"

export const pageKeySchema = z.object({
	s3_key: z.string(),
	order: z.number(),
	mime_type: z.string(),
	source_file: z.string(),
})

export type PageKey = z.infer<typeof pageKeySchema>

export function parsePageKeys(raw: unknown): PageKey[] {
	return z.array(pageKeySchema).parse(raw)
}

export type BatchIngestJobData = {
	id: string
	status: BatchStatus
	total_student_jobs: number
	notification_sent_at: Date | null
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
	total_student_jobs: number
	staged_scripts: BatchIngestJobData["staged_scripts"]
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
	phase: "classifying" | "staging" | "marking"
	isProcessing: boolean
	isReadyForReview: boolean

	batchId: string
	paperId: string

	/** All staged scripts for the current upload */
	allScripts: StagedScript[]
	/** Scripts not yet committed as submissions (status !== "submitted") */
	unsubmittedScripts: StagedScript[]
}
