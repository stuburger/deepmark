import type { StudentPaperAnnotation } from "@mcp-gcse/shared"

/**
 * Row shape used by the projection diff. Mirrors the writable columns of
 * `student_paper_annotations` minus `submission_id` (invariant per
 * projection run), `created_at`, `updated_at`, and `deleted_at` (managed
 * by Prisma / not derived from the Y.Doc).
 */
export type AnnotationRow = {
	id: string
	source: "ai" | "teacher"
	grading_run_id: string | null
	question_id: string
	page_order: number
	overlay_type: string
	sentiment: string | null
	payload: unknown
	anchor_token_start_id: string | null
	anchor_token_end_id: string | null
	bbox: unknown
	sort_order: number
}

export type DiffPlan = {
	inserts: AnnotationRow[]
	updates: AnnotationRow[]
	deleteIds: string[]
}

/**
 * Projects derived annotations into Lambda-ready rows. The `gradingRunId`
 * is applied to AI rows only — teacher rows always have `null`. Sort order
 * follows the input array order (deriveAnnotationsFromDoc walks the
 * document deterministically, so this is stable across re-projections of
 * the same Y.Doc).
 */
export function buildDesiredRows(
	derived: StudentPaperAnnotation[],
	gradingRunId: string | null,
): AnnotationRow[] {
	return derived.map((a, idx) => ({
		id: a.id,
		source: a.source,
		grading_run_id: a.source === "teacher" ? null : gradingRunId,
		question_id: a.question_id,
		page_order: a.page_order,
		overlay_type: a.overlay_type,
		sentiment: a.sentiment,
		payload: a.payload,
		anchor_token_start_id: a.anchor_token_start_id,
		anchor_token_end_id: a.anchor_token_end_id,
		bbox: a.bbox,
		sort_order: idx,
	}))
}

/**
 * Pure three-way diff between the existing DB rows and the desired rows
 * derived from the current Y.Doc. The caller executes the plan inside a
 * transaction.
 *
 * Identity is the row id (a stable UUID for teacher marks, a stable
 * `${jobId}:${questionId}:${sortOrder}` for AI marks — both minted at
 * mark-creation time and preserved through Y.Doc edits). Equality is a
 * field-by-field comparison; payload + bbox compare via canonical JSON so
 * key-order differences between PG-normalised jsonb and freshly-built JS
 * objects don't trigger false updates.
 */
export function diffAnnotations(
	existing: AnnotationRow[],
	desired: AnnotationRow[],
): DiffPlan {
	const existingById = new Map(existing.map((r) => [r.id, r]))
	const desiredById = new Map(desired.map((r) => [r.id, r]))

	const inserts: AnnotationRow[] = []
	const updates: AnnotationRow[] = []
	const deleteIds: string[] = []

	for (const d of desired) {
		const e = existingById.get(d.id)
		if (!e) {
			inserts.push(d)
			continue
		}
		if (!rowsEqual(e, d)) updates.push(d)
	}
	for (const e of existing) {
		if (!desiredById.has(e.id)) deleteIds.push(e.id)
	}

	return { inserts, updates, deleteIds }
}

function rowsEqual(a: AnnotationRow, b: AnnotationRow): boolean {
	return (
		a.source === b.source &&
		a.grading_run_id === b.grading_run_id &&
		a.question_id === b.question_id &&
		a.page_order === b.page_order &&
		a.overlay_type === b.overlay_type &&
		a.sentiment === b.sentiment &&
		a.anchor_token_start_id === b.anchor_token_start_id &&
		a.anchor_token_end_id === b.anchor_token_end_id &&
		a.sort_order === b.sort_order &&
		canonicalJson(a.payload) === canonicalJson(b.payload) &&
		canonicalJson(a.bbox) === canonicalJson(b.bbox)
	)
}

/**
 * Stringify with keys sorted recursively. PG jsonb storage normalises key
 * order on write, so a row read back from Prisma may have a different key
 * order than the JS object that produced it. Compare canonical forms.
 */
function canonicalJson(value: unknown): string {
	return JSON.stringify(value, (_key, v) => {
		if (v && typeof v === "object" && !Array.isArray(v)) {
			const entries = Object.entries(v as Record<string, unknown>).sort(
				([a], [b]) => (a < b ? -1 : a > b ? 1 : 0),
			)
			const sorted: Record<string, unknown> = {}
			for (const [k, val] of entries) sorted[k] = val
			return sorted
		}
		return v
	})
}
