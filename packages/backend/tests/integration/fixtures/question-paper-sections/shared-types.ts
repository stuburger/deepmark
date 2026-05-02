/**
 * Shared types for question-paper section-segmentation eval fixtures.
 *
 * A fixture represents a real multi-section question paper PDF plus the
 * ground-truth section structure that a correct extractor should produce.
 */

export type FixtureSectionExpectation = {
	/** Human-readable name to match ("Section A", "Section B", etc.). */
	title: string
	/** Sum of question marks within this section, per the paper's header. */
	total_marks: number
	/** Number of questions the extractor should place in this section. */
	question_count: number
	/** Expected question_numbers (as printed on the paper) within this section. */
	question_numbers: string[]
}

/**
 * Expected stimulus extraction for a single question.
 *
 *  - `labels`: the stimulus labels the question should reference (paper-printed,
 *    e.g. "Item A", "Source B"). Empty array means "this question has no
 *    stimulus".
 *  - `contentMustContain`: substrings that must appear in the extracted
 *    stimulus text — e.g. a distinctive name or phrase from the case study.
 *  - `questionTextMustContain` / `questionTextMustNotContain`: anchors on
 *    `question_text` itself, to catch the "case study glued to the question"
 *    regression (must contain the actual instruction, must not contain
 *    stimulus phrases).
 */
export type FixtureStimulusExpectation = {
	questionNumber: string
	labels: string[]
	contentMustContain?: string[]
	questionTextMustContain?: string[]
	questionTextMustNotContain?: string[]
}

/**
 * Expected marks extraction for a single question. Used by the marks
 * extraction eval to catch the regression where the LLM bleeds a 12-mark
 * total from a sibling onto a 2-mark question (the franchising/Quality
 * Wallpaper case).
 *
 *  - `marks`: the marks the extractor MUST produce in `total_marks`.
 *  - `printedInParens`: when true, the paper has "(N marks)" printed next
 *    to this question and the extractor MUST also populate `printed_marks`
 *    with the same value. When false, the paper omits the parenthetical
 *    (e.g. MCQs marked "(1 mark)" inline-only) and `printed_marks` may be
 *    null — the eval skips the printed-side assertion.
 */
export type FixtureMarksExpectation = {
	questionNumber: string
	marks: number
	printedInParens: boolean
}

export type QuestionPaperSectionsFixture = {
	name: string
	/** Absolute path to the fixture dir — used to load document.pdf. */
	dir: string
	/** PDF filename inside the fixture dir. */
	pdf_filename: string
	/** Paper-level total (all sections combined). */
	total_marks: number
	/** Whether the paper-wide total is printed verbatim on the cover/front matter. */
	paperTotalPrintedOnCover?: boolean
	sections: FixtureSectionExpectation[]
	/**
	 * Per-question stimulus expectations. Only include entries for questions
	 * where stimulus handling matters — questions not listed here are
	 * unchecked by the stimulus evals.
	 */
	stimulusExpectations?: FixtureStimulusExpectation[]
	/**
	 * Per-question marks expectations. Used by the marks-extraction eval to
	 * assert both `total_marks` and (when printed) `printed_marks`. Questions
	 * not listed here are unchecked by the marks eval.
	 */
	marksExpectations?: FixtureMarksExpectation[]
}
