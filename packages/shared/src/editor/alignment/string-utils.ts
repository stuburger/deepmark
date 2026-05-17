import type { WordWithOffset } from "./types"

/** Split text on whitespace, tracking original character positions. */
export function splitWithOffsets(text: string): WordWithOffset[] {
	const result: WordWithOffset[] = []
	const regex = /\S+/g
	for (let match = regex.exec(text); match !== null; match = regex.exec(text)) {
		result.push({
			word: match[0],
			start: match.index,
			end: match.index + match[0].length,
		})
	}
	return result
}
