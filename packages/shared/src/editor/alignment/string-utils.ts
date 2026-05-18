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

/** Classic Levenshtein distance between two strings. */
export function levenshtein(a: string, b: string): number {
	const m = a.length
	const n = b.length
	if (m === 0) return n
	if (n === 0) return m

	let prev = Array.from({ length: n + 1 }, (_, i) => i)
	for (let i = 1; i <= m; i++) {
		const curr = [i]
		for (let j = 1; j <= n; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1
			curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
		}
		prev = curr
	}
	return prev[n]
}

/** Normalised edit distance (0–1). 0 = identical, 1 = completely different. */
export function normalizedDistance(a: string, b: string): number {
	const maxLen = Math.max(a.length, b.length)
	if (maxLen === 0) return 0
	return levenshtein(a, b) / maxLen
}
