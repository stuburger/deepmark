export type PageKey = {
	s3_key: string
	order: number
	mime_type: string
	source_file: string
}

/**
 * Represents a single page extracted from a source PDF.
 * jpegKey/jpegBuffer are null for blank pages (no image content).
 */
export type PageData = {
	absoluteIndex: number
	jpegKey: string | null
	jpegBuffer: Buffer | null
}

export type PageGroup = {
	pages: PageData[]
	proposedName: string | null
	confidence: number
	hasUncertainPage: boolean
}

export type StagedScriptData = {
	page_keys: PageKey[]
	proposed_name: string | null
	confidence: number
	hasUncertainPage: boolean
}
