import type {
	BatchStatus,
	ClassificationMode,
	ReviewMode,
} from "@mcp-gcse/db"

export type PageKey = {
	s3_key: string
	order: number
	mime_type: string
	source_file: string
}

export type BatchIngestJobData = {
	id: string
	status: BatchStatus
	review_mode: ReviewMode
	classification_mode: ClassificationMode
	pages_per_script: number
	total_student_jobs: number
	notification_sent_at: Date | null
	error: string | null
	staged_scripts: Array<{
		id: string
		page_keys: PageKey[]
		proposed_name: string | null
		confirmed_name: string | null
		confidence: number | null
		status: string
		student_job_id: string | null
	}>
	student_jobs: Array<{
		id: string
		status: string
		student_name: string | null
		grading_results: unknown
	}>
}

export type ActiveBatchInfo = {
	id: string
	status: BatchStatus
	classification_mode: ClassificationMode
	pages_per_script: number
	total_student_jobs: number
	staged_scripts: BatchIngestJobData["staged_scripts"]
	student_jobs: BatchIngestJobData["student_jobs"]
} | null
