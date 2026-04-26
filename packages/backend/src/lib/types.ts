/**
 * Shared types used across domain boundaries.
 *
 * Types live here when they originate in one domain but are consumed by another,
 * avoiding direct cross-domain imports.
 */

export type PageMimeType =
	| "application/pdf"
	| "image/jpeg"
	| "image/png"
	| "image/webp"
	| "image/heic"

/**
 * A question seed supplied to the extraction model so it can return canonical
 * question_id values rather than OCR-derived question numbers.
 */
export type QuestionSeed = {
	question_id: string
	question_number: string
	question_text: string
	question_type: string
	max_score: number
	/** Present when `question_type === "multiple_choice"`. */
	multiple_choice_options?: Array<{
		option_label: string
		option_text: string
	}>
	/**
	 * Correct answer labels for an MCQ — populated from the linked mark
	 * scheme when one exists. Empty array if mark scheme isn't available
	 * yet at OCR time.
	 */
	correct_option_labels?: string[]
}
