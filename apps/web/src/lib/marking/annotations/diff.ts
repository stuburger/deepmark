import type { StudentPaperAnnotation } from "../types"

export type AnnotationDiff = {
	inserts: StudentPaperAnnotation[]
	updates: StudentPaperAnnotation[]
	deletes: string[]
}

/**
 * Compact fingerprint of the content-bearing fields of an annotation.
 * Used to decide whether an existing row needs an update.
 */
function contentFingerprint(a: StudentPaperAnnotation): string {
	return [
		a.overlay_type,
		a.sentiment ?? "",
		a.question_id,
		a.page_order,
		JSON.stringify(a.bbox),
		a.anchor_token_start_id ?? "",
		a.anchor_token_end_id ?? "",
		JSON.stringify(a.payload),
	].join("|")
}

/**
 * Compares the current editor-derived annotations against the DB state and
 * returns insert / update / soft-delete sets.
 *
 * - In editor but not in DB → insert (new teacher mark)
 * - In both, content changed → update
 * - In DB but not in editor → delete (teacher removed it)
 */
export function diffAnnotations(
	dbState: StudentPaperAnnotation[],
	editorState: StudentPaperAnnotation[],
): AnnotationDiff {
	const dbById = new Map(dbState.map((a) => [a.id, a]))
	const editorIds = new Set(editorState.map((a) => a.id))

	const inserts: StudentPaperAnnotation[] = []
	const updates: StudentPaperAnnotation[] = []

	for (const a of editorState) {
		const existing = dbById.get(a.id)
		if (!existing) {
			inserts.push(a)
			continue
		}
		if (contentFingerprint(existing) !== contentFingerprint(a)) {
			updates.push(a)
		}
	}

	const deletes: string[] = []
	for (const a of dbState) {
		if (!editorIds.has(a.id)) deletes.push(a.id)
	}

	return { inserts, updates, deletes }
}
