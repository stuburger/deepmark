/**
 * Pure structural transforms used by `segmentPdfScripts` to massage the
 * LLM's per-script `pageCount` output into validated 0-indexed ranges.
 *
 * These live in their own module (no LLM / SST / DB imports) so the unit
 * tests at `tests/unit/segment-script.test.ts` can exercise them without
 * pulling in the SST runtime — `segment-script.ts` itself transitively
 * imports `db` via the LLM runtime, which trips the SST guard during
 * vanilla `vitest run`.
 */

/** Range output: a script occupies pages [startPage..endPage] inclusive. */
export type SegmentedScript = {
	startPage: number
	endPage: number
	studentName: string | null
}

/** Shape of one script as emitted by the LLM, before ranges are derived. */
export type RawSegmentedScript = {
	pageCount: number
	studentName: string | null
}

export type ValidationResult = { ok: true } | { ok: false; error: string }

/**
 * The model periodically places a startPage on a blank page — that's always
 * wrong (blanks are unused answer space belonging to the preceding student).
 * Walk each startPage forward past any blanks. The previous script's endPage
 * is extended to absorb the skipped blanks. Duplicates that collide after
 * snapping are dropped.
 */
export function snapBlankStartPages(
	scripts: SegmentedScript[],
	blankSet: Set<number>,
	totalPages: number,
): SegmentedScript[] {
	const snappedStarts: number[] = scripts.map((s) => {
		let i = s.startPage
		while (i < totalPages && blankSet.has(i)) i++
		return i
	})

	const result: SegmentedScript[] = []
	for (let i = 0; i < scripts.length; i++) {
		const start = snappedStarts[i]
		if (start === undefined || start >= totalPages) continue
		if (i > 0 && start === snappedStarts[i - 1]) continue // collision — drop

		const nextStart =
			snappedStarts.slice(i + 1).find((s) => s > start) ?? totalPages
		const curr = scripts[i]
		if (!curr) continue
		result.push({
			startPage: start,
			endPage: nextStart - 1,
			studentName: curr.studentName,
		})
	}
	return result
}

export function lengthsToRanges(
	scripts: RawSegmentedScript[],
): SegmentedScript[] {
	let cursor = 0
	return scripts.map((s) => {
		const start = cursor
		const end = cursor + s.pageCount - 1
		cursor = end + 1
		return { startPage: start, endPage: end, studentName: s.studentName }
	})
}

export function validateScripts(
	scripts: SegmentedScript[],
	totalPages: number,
): ValidationResult {
	if (scripts.length === 0) {
		return { ok: false, error: "no scripts returned" }
	}

	const last = scripts[scripts.length - 1]
	if (!last) return { ok: false, error: "last script missing" }

	if (last.endPage !== totalPages - 1) {
		const covered = last.endPage + 1
		return {
			ok: false,
			error: `scripts cover ${covered} pages but PDF has ${totalPages}`,
		}
	}

	return { ok: true }
}
