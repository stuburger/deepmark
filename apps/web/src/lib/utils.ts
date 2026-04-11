import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs))
}

/**
 * Natural-sort comparison for question numbers like "1a", "2bii", "10".
 * Numbers within the string are compared numerically; letters lexicographically.
 */
export function naturalCompare(a: string | null, b: string | null): number {
	if (a === null && b === null) return 0
	if (a === null) return 1
	if (b === null) return -1
	const re = /(\d+)|(\D+)/g
	const partsA = [...a.matchAll(re)].map((m) => m[0])
	const partsB = [...b.matchAll(re)].map((m) => m[0])
	for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
		const pa = partsA[i] ?? ""
		const pb = partsB[i] ?? ""
		const na = Number(pa)
		const nb = Number(pb)
		if (!Number.isNaN(na) && !Number.isNaN(nb)) {
			if (na !== nb) return na - nb
		} else {
			if (pa < pb) return -1
			if (pa > pb) return 1
		}
	}
	return 0
}
