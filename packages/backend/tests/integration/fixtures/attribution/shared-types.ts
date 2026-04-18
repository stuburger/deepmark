/**
 * Shared types for script-level attribution eval fixtures.
 *
 * A fixture represents a full student submission (all pages + all tokens +
 * the exam paper's questions) plus a set of *expectations* the eval suite
 * checks against the attribution pipeline's output.
 */

export type FixtureQuestion = {
	id: string
	question_number: string
	question_type: "multiple_choice" | "written"
	text: string
	points: number
	multiple_choice_options: Array<{ option_label: string; option_text: string }>
}

export type FixtureToken = {
	page_order: number
	para_index: number
	line_index: number
	word_index: number
	text_raw: string
	bbox: [number, number, number, number]
}

export type FixturePage = {
	order: number
	mime_type: string
	/** Filename inside the fixture dir (not an absolute path). */
	image_filename: string
}

/**
 * One continuation-eval assertion per page. Pages have different mixes of
 * handwriting and pre-printed template — so a single ratio doesn't fit all.
 *
 *  - Pure continuation page (nothing on it but the ongoing answer):
 *      use `minCoverage` near 1.0 — almost every token on the page belongs
 *      to the target question.
 *  - Start/end page (target shares the page with other answers or printed
 *    question text): use `minTokens` to require a specific absolute count.
 *
 * At least one of the two thresholds must be set. When both are set, BOTH
 * must pass (AND semantics).
 */
export type ContinuationPageExpectation = {
	page: number
	/** 0..1 — ratio of tokens on this page attributed to the target question. */
	minCoverage?: number
	/** Absolute minimum count of tokens attributed to the target question. */
	minTokens?: number
}

/**
 * Per-fixture assertions. Only set the evals that apply — unset evals are
 * skipped for that fixture (no meaningful signal to check).
 */
export type FixtureExpectations = {
	/**
	 * Eval 1 — continuation coverage. An answer spans multiple pages; each
	 * listed page has its own threshold (pure continuation pages can require
	 * near-full coverage; mixed pages only need a minimum token count).
	 */
	continuation?: {
		questionNumber: string
		pages: ContinuationPageExpectation[]
	}
	/**
	 * Eval 3 — pages that must end up with ZERO attributed tokens. Used for
	 * cover pages, blank pages, or pages that contain only pre-printed
	 * template text.
	 */
	nonAnswerPages?: number[]
	/**
	 * Eval 4 — boundary correctness on dense multi-answer pages. On each
	 * listed page, every question in `mustHaveNonTrivial` must receive at
	 * least `minTokensPerAnswer` attributed tokens (proves the model didn't
	 * collapse them into one another).
	 */
	densePages?: Array<{
		page: number
		mustHaveNonTrivial: string[]
		minTokensPerAnswer: number
	}>
	/**
	 * Eval 5 — answer_text content checks. The LLM-authored answer_text for
	 * each listed question must include every substring in `substrings`.
	 *
	 * Used to catch the OCR-drops-punctuation regression: Cloud Vision word
	 * tokenisation routinely loses standalone marks like "-", "=", "+", so
	 * any answer that contains those characters in the handwriting is a good
	 * canary for whether attribution's punctuation-preserving text path is
	 * working.
	 */
	answerTextMustContain?: Array<{
		questionNumber: string
		substrings: string[]
	}>
}

export type FixtureSpec = {
	name: string
	/** Deterministic test IDs so seeding is idempotent and easy to clean up. */
	userId: string
	examPaperId: string
	sectionId: string
	/** Absolute path to the fixture dir — used to load image files + tokens.json. */
	dir: string
	questions: FixtureQuestion[]
	pages: FixturePage[]
	expectations: FixtureExpectations
}
