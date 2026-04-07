/**
 * Extracts the first JSON object from a Gemini response string.
 * Handles thinking-model output that may include preamble text or reasoning.
 */
export function extractJsonFromResponse(rawText: string): string | null {
	const start = rawText.indexOf("{")
	const end = rawText.lastIndexOf("}")
	if (start === -1 || end === -1 || end < start) return null
	return rawText.slice(start, end + 1)
}
