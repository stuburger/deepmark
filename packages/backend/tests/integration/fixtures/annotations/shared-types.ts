import type { GradingResult } from "@/lib/grading/grade-questions"
import type { MarkSchemeForAnnotation, TokenRow } from "@/lib/annotations/types"

/**
 * Per-fixture expectations for the annotation eval suite. Only set what
 * applies — unset evals are skipped per-fixture so we can grow assertions
 * incrementally without forcing every fixture to support every check.
 */
export type AnnotationFixtureExpectations = {
	/** Min / max annotation count. Catches "LLM emitted nothing" and runaway prompts. */
	annotationCount?: { min: number; max: number }
	/**
	 * AO codes that MUST appear on at least one emitted annotation. Use for
	 * LoR fixtures where the prompt should anchor on awarded AOs. Empty/omit
	 * for point_based where AO tagging is optional.
	 */
	mustHaveAoCodes?: string[]
	/**
	 * Signals that must each appear at least once. Lets us assert "this LoR
	 * answer should have at least one positive (tick/underline) and one
	 * critical (cross/box) mark".
	 */
	mustHaveSignals?: Array<
		"tick" | "cross" | "underline" | "double_underline" | "box" | "circle"
	>
	/**
	 * If a `phrase` field is added to the LLM schema, this asserts that
	 * `student_answer.slice(char_start, char_end) === phrase` for every
	 * emitted annotation. Skipped until that schema lands.
	 */
	requirePhraseConsistency?: boolean
}

export type AnnotationFixtureSpec = {
	name: string
	/** Absolute path to the fixture dir — used to load tokens.json. */
	dir: string
	/**
	 * The grading result that would feed `annotateOneQuestion`. Captured
	 * from a real submission so the LLM sees a real (non-toy) input.
	 */
	gradingResult: GradingResult
	/** The mark scheme as it would arrive from the loader. */
	markScheme: MarkSchemeForAnnotation
	/** Optional level descriptors (LoR). */
	levelDescriptors?: string | null
	examBoard: string | null
	subject: string | null
	expectations: AnnotationFixtureExpectations
}

/**
 * Token row as stored in the JSON fixture file. The eval lifts these into
 * `TokenRow` shape at load time (adding the question_id from the grading
 * result). Keeping JSON shapes simple makes manual fixture editing tractable.
 */
export type AnnotationFixtureToken = {
	id: string
	page_order: number
	para_index: number
	line_index: number
	word_index: number
	text_raw: string
	text_corrected: string | null
	bbox: [number, number, number, number]
	confidence: number
}

/** Shape of the `assertTokenShape` helper's return — narrows the loaded rows. */
export type LoadedFixtureToken = TokenRow & {
	para_index: number
	line_index: number
	word_index: number
	confidence: number
}
