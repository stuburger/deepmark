export type LlmProvider = "google" | "openai" | "anthropic"

export type LlmModelEntry = {
	provider: LlmProvider
	model: string
	temperature: number
}

export type LlmCallSiteRow = {
	id: string
	key: string
	display_name: string
	description: string | null
	input_type: string
	phase: string | null
	models: LlmModelEntry[]
	updated_by: string | null
	updated_at: Date
}

export type LlmInputType = "text" | "vision" | "pdf"

/** What drives the call count for a call site. */
export type CallMultiplier = "once" | "per-page" | "per-question" | "per-lor-question"

export const CALL_MULTIPLIER_LABELS: Record<CallMultiplier, string> = {
	once: "once",
	"per-page": "per page",
	"per-question": "per question",
	"per-lor-question": "per LoR question",
}

/**
 * Model pricing per million tokens (USD).
 * Used for cost estimation in the UI — not billing.
 */
export const MODEL_PRICING: Record<
	string,
	{ input: number; output: number }
> = {
	// Google
	"gemini-2.5-flash": { input: 0.15, output: 0.60 },
	"gemini-2.5-flash-lite": { input: 0.075, output: 0.30 },
	"gemini-2.5-pro": { input: 1.25, output: 10.0 },
	"gemini-3-flash-preview": { input: 0.15, output: 0.60 },
	"gemini-3.1-pro-preview": { input: 1.25, output: 10.0 },
	// OpenAI
	"gpt-4o": { input: 2.5, output: 10.0 },
	"gpt-4o-mini": { input: 0.15, output: 0.60 },
	"gpt-4.1": { input: 2.0, output: 8.0 },
	"gpt-4.1-mini": { input: 0.40, output: 1.60 },
	"gpt-4.1-nano": { input: 0.10, output: 0.40 },
	// Anthropic
	"claude-opus-4-6": { input: 15.0, output: 75.0 },
	"claude-sonnet-4-6": { input: 3.0, output: 15.0 },
	"claude-haiku-4-5": { input: 0.80, output: 4.0 },
}

/**
 * Pipeline phases — used for grouping and ordering call sites in the UI.
 * Listed in the temporal order they execute during the marking pipeline.
 */
export type LlmPhase =
	| "setup"
	| "segmentation"
	| "answer-detection"
	| "grading"
	| "annotations"
	| "tools"

export const LLM_PHASE_LABELS: Record<LlmPhase, string> = {
	setup: "Setup",
	segmentation: "Script Segmentation",
	"answer-detection": "Answer Detection",
	grading: "Grading",
	annotations: "Annotations",
	tools: "Tools",
}

export const LLM_PHASE_DESCRIPTIONS: Record<LlmPhase, string> = {
	setup: "Extracts questions and mark schemes when you upload exam papers.",
	segmentation: "Splits multi-student PDFs into individual scripts.",
	"answer-detection":
		"Reads student handwriting and locates answers on the page.",
	grading: "Marks each answer against the mark scheme.",
	annotations: "Generates inline feedback on the scanned script.",
	tools: "Background utilities for mark scheme validation.",
}

/** Display order for phases. */
export const LLM_PHASE_ORDER: LlmPhase[] = [
	"setup",
	"segmentation",
	"answer-detection",
	"grading",
	"annotations",
	"tools",
]

/** Known providers and their available models. */
export const PROVIDER_MODELS: Record<LlmProvider, string[]> = {
	google: [
		"gemini-2.5-flash",
		"gemini-2.5-flash-lite",
		"gemini-2.5-pro",
		"gemini-3-flash-preview",
		"gemini-3.1-pro-preview",
		"gemini-embedding-001",
		"gemini-embedding-2-preview",
	],
	openai: [
		"gpt-4o",
		"gpt-4o-mini",
		"gpt-4.1",
		"gpt-4.1-mini",
		"gpt-4.1-nano",
		"gpt-5.4",
		"gpt-5.4-mini",
		"gpt-5.4-nano",
		"o3",
		"o4-mini",
	],
	anthropic: ["claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5"],
}

/**
 * All call site definitions used for seeding and display.
 *
 * Ordered by pipeline phase, then by temporal execution order within each phase.
 * This order is the canonical sort for the admin UI.
 */
export const LLM_CALL_SITE_DEFAULTS: Array<{
	key: string
	display_name: string
	description: string
	input_type: LlmInputType
	phase: LlmPhase
	/** Step number within the phase. Same step = runs in parallel. */
	step: number
	/** What drives the call count — "once", "per-page", "per-question", etc. */
	multiplier: CallMultiplier
	models: LlmModelEntry[]
}> = [
	// ── Setup ────────────────────────────────────────────────────────────
	// Runs when a teacher uploads a QP, MS, or exemplar PDF.
	{
		key: "pdf-metadata-detection",
		display_name: "PDF Upload Metadata Detection",
		description:
			"Detects document type, subject, and metadata when uploading PDFs from the web UI.",
		input_type: "pdf",
		phase: "setup",
		step: 1, multiplier: "once",
		models: [
			{ provider: "google", model: "gemini-2.5-flash", temperature: 0.1 },
		],
	},
	{
		key: "question-paper-metadata",
		display_name: "Question Paper Metadata",
		description: "Detects exam paper metadata from question paper cover page.",
		input_type: "pdf",
		phase: "setup",
		step: 2, multiplier: "once",
		models: [
			{ provider: "google", model: "gemini-2.5-flash", temperature: 0.1 },
		],
	},
	{
		key: "question-paper-extraction",
		display_name: "Question Paper Extraction",
		description:
			"Extracts questions, types, and marks from uploaded question paper PDFs.",
		input_type: "pdf",
		phase: "setup",
		step: 2, multiplier: "once",
		models: [
			{ provider: "google", model: "gemini-2.5-flash", temperature: 0.2 },
		],
	},
	{
		key: "mark-scheme-metadata",
		display_name: "Mark Scheme Metadata",
		description:
			"Detects exam paper title, subject, board, and year from mark scheme cover page.",
		input_type: "pdf",
		phase: "setup",
		step: 3, multiplier: "once",
		models: [
			{ provider: "google", model: "gemini-2.5-flash", temperature: 0.1 },
		],
	},
	{
		key: "mark-scheme-extraction",
		display_name: "Mark Scheme Extraction",
		description:
			"Extracts questions, mark points, and level descriptors from uploaded mark scheme PDFs.",
		input_type: "pdf",
		phase: "setup",
		step: 3, multiplier: "once",
		models: [
			{ provider: "google", model: "gemini-2.5-flash", temperature: 0.2 },
		],
	},
	{
		key: "exemplar-extraction",
		display_name: "Exemplar Extraction",
		description: "Extracts exemplar answers from uploaded exemplar PDFs.",
		input_type: "pdf",
		phase: "setup",
		step: 4, multiplier: "once",
		models: [
			{ provider: "google", model: "gemini-2.5-flash", temperature: 0.2 },
		],
	},
	{
		key: "mark-scheme-autofill",
		display_name: "Mark Scheme Autofill",
		description:
			"Auto-generates mark scheme suggestions from question text in the editor.",
		input_type: "text",
		phase: "setup",
		step: 5, multiplier: "once",
		models: [
			{ provider: "google", model: "gemini-2.5-flash", temperature: 0.2 },
		],
	},

	// ── Batch Classification ─────────────────────────────────────────────
	// Runs when a multi-student PDF is uploaded and segmented into scripts.
	{
		key: "script-boundary-classification",
		display_name: "Script Boundary Classification",
		description:
			"Classifies whether a page starts a new student script during batch segmentation.",
		input_type: "vision",
		phase: "segmentation",
		step: 1, multiplier: "per-page",
		models: [
			{ provider: "google", model: "gemini-2.5-flash", temperature: 0.2 },
		],
	},
	{
		key: "blank-page-classification",
		display_name: "Blank Page Classification",
		description:
			"Classifies blank pages as separators, script pages, or artifacts.",
		input_type: "vision",
		phase: "segmentation",
		step: 1, multiplier: "per-page",
		models: [
			{ provider: "google", model: "gemini-2.5-flash", temperature: 0.2 },
		],
	},
	{
		key: "student-name-extraction",
		display_name: "Student Name Extraction",
		description:
			"Extracts student name from the first page of a script during batch classification.",
		input_type: "vision",
		phase: "segmentation",
		step: 2, multiplier: "once",
		models: [
			{ provider: "google", model: "gemini-2.5-flash", temperature: 0.2 },
		],
	},

	// ── OCR & Answer Detection ───────────────────────────────────────────
	// Phase 1 of the marking pipeline: extract answers from scanned scripts.
	{
		key: "student-paper-extraction",
		display_name: "Answer Extraction",
		description:
			"Extracts student name, subject, and per-question answers from scanned exam pages.",
		input_type: "vision",
		phase: "answer-detection",
		step: 1, multiplier: "once",
		models: [
			{ provider: "google", model: "gemini-2.5-flash", temperature: 0.1 },
		],
	},
	{
		key: "handwriting-ocr",
		display_name: "Handwriting OCR",
		description:
			"Transcribes handwritten text and provides handwriting analysis from page images.",
		input_type: "vision",
		phase: "answer-detection",
		step: 1, multiplier: "per-page",
		models: [
			{ provider: "google", model: "gemini-2.5-flash", temperature: 0.2 },
		],
	},
	{
		key: "vision-token-reconciliation",
		display_name: "Token Reconciliation",
		description:
			"Corrects Cloud Vision OCR tokens against original page images for accuracy.",
		input_type: "vision",
		phase: "answer-detection",
		step: 2, multiplier: "per-page",
		models: [
			{ provider: "google", model: "gemini-2.5-pro", temperature: 0.1 },
		],
	},
	{
		key: "vision-attribution",
		display_name: "Answer Region Attribution",
		description:
			"Assigns OCR tokens to questions and derives answer region bounding boxes.",
		input_type: "vision",
		phase: "answer-detection",
		step: 3, multiplier: "per-page",
		models: [
			{ provider: "google", model: "gemini-2.5-pro", temperature: 0.1 },
		],
	},
	{
		key: "vision-attribution-mcq-fallback",
		display_name: "MCQ Region Fallback",
		description:
			"Fallback for locating MCQ answers when primary attribution misses them.",
		input_type: "vision",
		phase: "answer-detection",
		step: 4, multiplier: "per-page",
		models: [
			{ provider: "google", model: "gemini-2.5-flash", temperature: 0.1 },
		],
	},
	{
		key: "answer-alignment",
		display_name: "Answer Alignment",
		description:
			"LLM fallback to align OCR-extracted answers to exam questions when string matching fails.",
		input_type: "text",
		phase: "answer-detection",
		step: 5, multiplier: "once",
		models: [
			{ provider: "google", model: "gemini-2.5-flash", temperature: 0.3 },
		],
	},

	// ── Grading ──────────────────────────────────────────────────────────
	// Phase 2: grade each answer against the mark scheme.
	{
		key: "grading",
		display_name: "Grading",
		description:
			"Grades student answers via the MarkerOrchestrator (point-based and level-of-response).",
		input_type: "text",
		phase: "grading",
		step: 1, multiplier: "per-question",
		models: [
			{ provider: "google", model: "gemini-2.5-flash", temperature: 0.3 },
		],
	},

	// ── Enrichment & Annotations ─────────────────────────────────────────
	// Phase 3: generate inline annotations on the scanned script.
	{
		key: "llm-annotations",
		display_name: "LLM Annotations",
		description:
			"Generates inline annotations on student scripts after grading (enrichment phase).",
		input_type: "text",
		phase: "annotations",
		step: 1, multiplier: "per-lor-question",
		models: [
			{ provider: "google", model: "gemini-2.5-flash", temperature: 0.7 },
		],
	},

	// ── Tools & Utilities ────────────────────────────────────────────────
	// MCP tools and background validation — not part of the main pipeline.
	{
		key: "test-dataset-generation",
		display_name: "Test Dataset Generation",
		description:
			"Generates diverse test cases for mark scheme validation via MCP tools.",
		input_type: "text",
		phase: "tools",
		step: 1, multiplier: "once",
		models: [
			{ provider: "google", model: "gemini-2.5-flash", temperature: 0.8 },
		],
	},
]
