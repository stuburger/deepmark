import type { Mark as PmMark, Node as PmNode } from "@tiptap/pm/model"
import { alignTokensToAnswer } from "./alignment/align"
import { tokenIdsInRange } from "./alignment/cursor-resolution"
import type { TokenAlignment } from "./alignment/types"
import { TIPTAP_TO_ENTRY } from "./mark-registry"
import type { PageToken, StudentPaperAnnotation } from "./types"

type Bbox = [number, number, number, number]

/**
 * Compute a bounding box hull from multiple [yMin, xMin, yMax, xMax] bboxes.
 * Returns null when no bboxes are supplied.
 */
function bboxHull(boxes: ReadonlyArray<Bbox>): Bbox | null {
	if (boxes.length === 0) return null
	let yMin = Number.POSITIVE_INFINITY
	let xMin = Number.POSITIVE_INFINITY
	let yMax = Number.NEGATIVE_INFINITY
	let xMax = Number.NEGATIVE_INFINITY
	for (const [tY1, tX1, tY2, tX2] of boxes) {
		if (tY1 < yMin) yMin = tY1
		if (tX1 < xMin) xMin = tX1
		if (tY2 > yMax) yMax = tY2
		if (tX2 > xMax) xMax = tX2
	}
	return [yMin, xMin, yMax, xMax]
}

type LegacyOcrToken = {
	tokenId: string
	bbox: Bbox
	pageOrder: number
}

/** Pull legacy `ocrToken` mark data from a text node — fallback for docs
 * authored before render-time alignment landed. New docs have no such marks. */
function legacyOcrTokensFromNode(node: PmNode): LegacyOcrToken[] {
	const tokens: LegacyOcrToken[] = []
	for (const mark of node.marks) {
		if (mark.type.name !== "ocrToken") continue
		const id = mark.attrs.tokenId as string | null
		const bbox = mark.attrs.bbox as Bbox | null
		if (id && bbox) {
			tokens.push({
				tokenId: id,
				bbox,
				pageOrder: (mark.attrs.pageOrder as number) ?? 0,
			})
		}
	}
	return tokens
}

type AnnotExtent = {
	mark: PmMark
	charFrom: number
	charTo: number
	legacyTokens: LegacyOcrToken[]
}

/**
 * Context for runtime bbox resolution. Pass `alignmentByQuestion` when
 * you already have a memoised alignment (the web hook gets this from
 * `useQuestionAlignments`); the function will reuse it instead of
 * re-running Levenshtein. Callers without a pre-computed alignment can
 * pass `tokensByQuestion` only and the function will compute on the fly
 * (Lambda path — alignment runs once per snapshot, not a hot path).
 *
 * `tokensByQuestion` is needed in both cases — alignment alone maps
 * `tokenId → char range`; we still need the original PageToken records
 * to read `bbox` + `page_order` when assembling the hull.
 */
export type DeriveAnnotationsContext = {
	alignmentByQuestion?: ReadonlyMap<string, TokenAlignment>
	tokensByQuestion?: ReadonlyMap<string, ReadonlyArray<PageToken>>
}

/**
 * Walks a ProseMirror document and derives `StudentPaperAnnotation[]` from
 * every annotation mark found inside `questionAnswer` nodes.
 *
 * Bbox resolution falls through three layers per annotation:
 *
 *   1. **Cached scan attrs** (`scanBbox`, `scanPageOrder`, `scanTokenStartId`,
 *      `scanTokenEndId` on the mark) — written by `applyAnnotationMark` for
 *      AI-authored marks. Single fastest path; no alignment needed.
 *
 *   2. **Runtime alignment** — when a `TokenAlignment` is available for
 *      the question (supplied directly via `alignmentByQuestion`, or
 *      computed from `tokensByQuestion`), the annotation's char range is
 *      resolved to a set of tokenIds via `tokenIdsInRange`. The bbox
 *      hull of those tokens is the canonical render-time bbox.
 *
 *   3. **Legacy `ocrToken` mark hull** — for documents authored before
 *      render-time alignment landed (where per-word `ocrToken` marks were
 *      persisted into Y-doc state). Bbox is the hull of co-located
 *      ocrToken marks. Strict fallback; new docs never hit this path.
 *
 * If none of the three layers produces a bbox, the annotation is skipped
 * (no row written). This protects the projection from emitting
 * un-renderable rows.
 */
export function deriveAnnotationsFromDoc(
	doc: PmNode,
	ctx: DeriveAnnotationsContext = {},
): StudentPaperAnnotation[] {
	const annotations: StudentPaperAnnotation[] = []
	const seenKeys = new Set<string>()

	doc.descendants((node, _pos) => {
		if (node.type.name !== "questionAnswer") return

		const questionId = node.attrs.questionId as string | null
		if (!questionId) return

		const tokens = ctx.tokensByQuestion?.get(questionId) ?? []
		const tokenById = new Map(tokens.map((t) => [t.id, t]))
		// Prefer the caller-supplied alignment — `useQuestionAlignments`
		// memoises it across PM transactions, so the hot path (every
		// keystroke triggers a re-derivation) never re-runs Levenshtein.
		// Lambda paths without a pre-computed alignment fall back to
		// computing it once here.
		const provided = ctx.alignmentByQuestion?.get(questionId)
		const answer = node.textContent
		const alignment =
			provided ??
			(tokens.length > 0 && answer.length > 0
				? alignTokensToAnswer(answer, tokens)
				: null)

		// First sweep: collect, per annotation key, the char extent across
		// every text-node child it appears on plus any legacy ocrToken marks
		// co-located with it. An annotation that spans multiple inline
		// fragments (e.g. a "tick" mark over text that's also bolded mid-run)
		// has multiple PM children; the projected bbox must span all of them.
		const byAnnotKey = new Map<string, AnnotExtent>()
		let childOffset = 0
		for (let i = 0; i < node.childCount; i++) {
			const child = node.child(i)
			const offsetForChild = childOffset
			childOffset += child.nodeSize
			if (!child.isText || !child.marks.length) continue

			const legacyTokens = legacyOcrTokensFromNode(child)

			for (const mark of child.marks) {
				if (!TIPTAP_TO_ENTRY.has(mark.type.name)) continue
				const attrs = mark.attrs as Record<string, unknown>
				const annotationId = attrs.annotationId as string | null

				const childFrom = offsetForChild
				const childTo = offsetForChild + child.nodeSize
				// AnnotationId-bearing marks (AI-authored) group across every child
				// they cover so the projected bbox spans the full extent. Teacher
				// marks without an id stay per-child — matching the dedupe shape
				// `${questionId}-${type}-${charFrom}-${charTo}` consumers rely on.
				const key =
					annotationId ??
					`${questionId}-${mark.type.name}-${childFrom}-${childTo}`

				const existing = byAnnotKey.get(key)
				if (existing) {
					if (childFrom < existing.charFrom) existing.charFrom = childFrom
					if (childTo > existing.charTo) existing.charTo = childTo
					for (const t of legacyTokens) {
						if (!existing.legacyTokens.some((c) => c.tokenId === t.tokenId)) {
							existing.legacyTokens.push(t)
						}
					}
				} else {
					byAnnotKey.set(key, {
						mark,
						charFrom: childFrom,
						charTo: childTo,
						legacyTokens: [...legacyTokens],
					})
				}
			}
		}

		// Second sweep: project each annotation extent through the bbox
		// resolution waterfall.
		for (const [annotKey, ent] of byAnnotKey) {
			const entry = TIPTAP_TO_ENTRY.get(ent.mark.type.name)
			if (!entry) continue
			const attrs = ent.mark.attrs as Record<string, unknown>
			const existingId = attrs.annotationId as string | null
			const dedupeKey = existingId ?? annotKey

			if (seenKeys.has(dedupeKey)) continue
			seenKeys.add(dedupeKey)

			let bbox: Bbox | null = null
			let pageOrder: number | null = null
			let startTokenId: string | null = null
			let endTokenId: string | null = null

			if (attrs.scanBbox != null) {
				// Layer 1 — cached scan attrs.
				bbox = attrs.scanBbox as Bbox
				pageOrder = attrs.scanPageOrder as number
				startTokenId = (attrs.scanTokenStartId as string) ?? null
				endTokenId = (attrs.scanTokenEndId as string) ?? null
			} else if (alignment) {
				// Layer 2 — runtime alignment.
				const ids = tokenIdsInRange(ent.charFrom, ent.charTo, alignment)
				const hits = ids
					.map((id) => tokenById.get(id))
					.filter((t): t is PageToken => Boolean(t))
				if (hits.length > 0) {
					const sorted = [...hits].sort((a, b) => {
						const aStart = alignment.tokenMap[a.id]?.start ?? 0
						const bStart = alignment.tokenMap[b.id]?.start ?? 0
						return aStart - bStart
					})
					bbox = bboxHull(sorted.map((t) => t.bbox))
					pageOrder = sorted[0].page_order
					startTokenId = sorted[0].id
					endTokenId = sorted[sorted.length - 1].id
				}
			}

			if (!bbox && ent.legacyTokens.length > 0) {
				// Layer 3 — legacy ocrToken hull.
				bbox = bboxHull(ent.legacyTokens.map((t) => t.bbox))
				pageOrder = ent.legacyTokens[0].pageOrder
				startTokenId = ent.legacyTokens[0].tokenId
				endTokenId = ent.legacyTokens[ent.legacyTokens.length - 1].tokenId
			}

			if (!bbox || pageOrder == null) continue

			const source =
				attrs.source === "teacher" ? ("teacher" as const) : ("ai" as const)

			annotations.push({
				id: dedupeKey,
				grading_run_id: null,
				question_id: questionId,
				page_order: pageOrder,
				overlay_type: entry.overlayType,
				sentiment: (attrs.sentiment as string) ?? "neutral",
				source,
				payload: entry.buildPayload(attrs),
				bbox,
				anchor_token_start_id: startTokenId,
				anchor_token_end_id: endTokenId,
			} as StudentPaperAnnotation)
		}
	})

	return annotations
}
