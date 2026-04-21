// ── Shared document type ────────────────────────────────────────────────────

export type PdfDocumentType = "mark_scheme" | "question_paper" | "exemplar"

// ── Metadata extraction ─────────────────────────────────────────────────────

export type DetectedPdfMetadata = {
	title: string
	subject: string
	exam_board: string
	year: number | null
	paper_number: number | null
	total_marks: number
	duration_minutes: number
	document_type: PdfDocumentType
	/** "foundation" | "higher" when printed on the cover; null for untiered or unknown. */
	tier: "foundation" | "higher" | null
}

export type IngestionSlot = {
	s3MetadataKey: string
	document_type: PdfDocumentType
	run_adversarial_loop?: boolean
}

// ── Live state polling ──────────────────────────────────────────────────────

export type ActiveExamPaperIngestionJob = {
	id: string
	document_type: string
	status: string
	error: string | null
}

export type PdfDocument = {
	id: string
	document_type: string
	processed_at: Date | null
}
