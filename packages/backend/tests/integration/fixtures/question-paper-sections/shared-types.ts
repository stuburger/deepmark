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

export type QuestionPaperSectionsFixture = {
	name: string
	/** Absolute path to the fixture dir — used to load document.pdf. */
	dir: string
	/** PDF filename inside the fixture dir. */
	pdf_filename: string
	/** Paper-level total (all sections combined). */
	total_marks: number
	sections: FixtureSectionExpectation[]
}
