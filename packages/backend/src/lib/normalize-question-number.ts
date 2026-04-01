/**
 * Normalises a raw question number string to a compact canonical form
 * suitable for exact-match lookups.
 *
 * Examples:
 *   "Question 1(a)(ii)" → "1aii"
 *   "Q3b"               → "3b"
 *   "2.b"               → "2b"
 *   "1 a"               → "1a"
 */
export function normalizeQuestionNumber(raw: string): string {
	return raw
		.replace(/^(question|q)\s*/i, "") // strip leading Q / Question
		.replace(/[()[\]{} ]/g, "") // remove brackets and spaces
		.replace(/\.(?=[a-z])/gi, "") // remove dot before letter (2.b → 2b)
		.toLowerCase()
		.trim()
}
