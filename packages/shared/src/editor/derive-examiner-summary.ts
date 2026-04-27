import type { Node as PmNode } from "@tiptap/pm/model"

const QUESTION_BLOCK_TYPES = new Set(["questionAnswer", "mcqTable"])

/**
 * Project the doc's leading paragraph block(s) onto the
 * `GradingRun.examiner_summary` PG column. Only paragraphs that appear
 * BEFORE the first `questionAnswer` / `mcqTable` block are considered the
 * examiner comment — paragraphs inserted between question blocks are
 * informal teacher notes that aren't part of the paper-level summary.
 *
 * Multiple leading paragraphs (e.g. teacher splits the comment in two) are
 * joined with a blank line so the PG column round-trips cleanly into the
 * PDF export and CSV.
 *
 * Returns `null` when no leading paragraph carries any text — clears the
 * column so the PDF stops showing a stale AI summary after the teacher
 * deletes it.
 */
export function deriveExaminerSummaryFromDoc(doc: PmNode): string | null {
	const parts: string[] = []

	for (let i = 0; i < doc.childCount; i++) {
		const child = doc.child(i)
		if (QUESTION_BLOCK_TYPES.has(child.type.name)) break
		if (child.type.name !== "paragraph") continue
		const text = child.textContent.trim()
		if (text.length > 0) parts.push(text)
	}

	if (parts.length === 0) return null
	return parts.join("\n\n")
}
