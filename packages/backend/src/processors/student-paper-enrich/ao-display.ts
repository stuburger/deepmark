/**
 * Returns the display label for an AO category.
 *
 * AO definitions are standardised by Ofqual per SUBJECT, not per exam board.
 * AQA History AO1 = Edexcel History AO1. The LLM uses whatever labels appear
 * in the level descriptors, so we pass them through unchanged.
 */
export function aoDisplayLabel(
	_examBoard: string | null,
	category: string,
): string {
	return category
}
