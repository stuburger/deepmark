/**
 * LoR Exemplar Reference Bank — fixture types.
 *
 * Each ExemplarQuestion bundles a real AQA-style Business question with a set
 * of answers spanning Level 1 through the top Level, plus a "Fake" answer that
 * looks polished but is structurally capped one Level lower (the canonical
 * trap for "marker rewards surface polish over depth"). Every answer carries
 * an ExpectedOutcome — the human-validated mark/Level the marker should
 * produce.
 *
 * Source: docs/build-plan-2026-05-15-marking-accuracy.md →
 *         DeepMark Exemplar Reference Bank.pdf (Stuart, 2026-05).
 */

export type AqaLevelTemplateKey =
	| "aqa-4-mark"
	| "aqa-6-mark-justify"
	| "aqa-6-mark-analyse"
	| "aqa-9-mark-evaluate"
	| "aqa-12-mark-evaluate"

export type ExpectedOutcome = {
	/** Level the answer SHOULD be awarded (1..topLevel). */
	level: number
	/** Inclusive mark band the answer should land in (from the bank). */
	markMin: number
	markMax: number
	/**
	 * Fake exemplars look polished but are structurally one Level below their
	 * apparent quality. A correct marker awards them at the expected (lower)
	 * Level; a marker that rewards surface polish over depth promotes them.
	 * For traps we hard-fail if predicted mark exceeds markMax.
	 */
	isTrap: boolean
}

export type ExemplarAnswer = {
	/** Slug unique within the question — "L1", "L2", "L3", "L4", "Fake-L3", "Fake-L4". */
	id: string
	/** Verbatim student answer text. */
	text: string
	expected: ExpectedOutcome
	/** Examiner commentary bullets (the "Why L_?" lines). Logged, not asserted. */
	whyNotes: string[]
}

export type ExemplarQuestion = {
	/** Slug unique across the bank — "freshblend-q1", "techfix-q1", etc. */
	id: string
	businessName: string
	/** One-line context printed beneath the business name. */
	businessContext: string
	/** The literal question prompt. */
	questionText: string
	totalMarks: number
	commandWord: "Explain" | "Justify" | "Analyse" | "Evaluate"
	templateKey: AqaLevelTemplateKey
	/**
	 * Indicative content — what a strong answer covers. Stitched into the
	 * mark scheme content markdown by the template renderer. Keep terse.
	 */
	indicativeContent: string
	answers: ExemplarAnswer[]
}
