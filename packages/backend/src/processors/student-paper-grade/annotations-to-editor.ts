import type { PendingAnnotation } from "@/lib/annotations/types"
import type { AnnotationSpec } from "@/lib/collab/editor-seed"
import type { HeadlessEditor } from "@/lib/collab/headless-editor"
import {
	type AnnotationMarkSpec,
	type AnnotationSignal,
	applyAnnotationMark,
	isMarkSignal,
} from "@mcp-gcse/shared"

/**
 * Dispatch all AI annotations for a *single* question as PM `addMark`
 * transactions on the supplied editor.
 *
 * The annotation LLM emits a verbatim `phrase` from the student answer;
 * `annotateOneQuestion` resolved that to a char range via `indexOf` and
 * stamped `charStart` / `charEnd` directly onto the `PendingAnnotation`.
 * So this function reads PM-mark `from`/`to` straight off the pending
 * record — no fuzzy alignment, no token-ID lookup, no char counting
 * on the LLM's part. The grader-facing text is the canonical source of
 * truth; the LLM's quote is anchored exactly where it appears in that text.
 *
 * Scan-side metadata (bbox / pageOrder / anchor token IDs) is carried
 * through onto the PM mark attrs so `deriveAnnotationsFromDoc` can
 * reverse-resolve the bbox without re-aligning. This is kept for now to
 * avoid a coordinated schema change across the editor + projection layer;
 * the schema-removal pass can land later, at which point
 * `deriveAnnotationsFromDoc` falls back to ocrToken-hull (already
 * implemented at `derive-annotations.ts:124-140`).
 *
 * Called once per question, immediately after that question is graded and
 * annotated — so marks appear in the doc progressively as the grade Lambda
 * works, not in one batch at the end. The caller owns the editor session
 * (one open/close per Lambda invocation).
 *
 * Errors propagate. The document is the source of truth, so a failed
 * editor transact must be a real failure: SQS retries the grade message.
 */
export function dispatchAnnotationsForQuestion(args: {
	editor: HeadlessEditor
	jobId: string
	questionId: string
	answerText: string
	annotations: PendingAnnotation[]
}): void {
	if (args.annotations.length === 0) return
	if (args.answerText.length === 0) return

	const specs: AnnotationSpec[] = []
	for (const ann of args.annotations) {
		const spec = pendingAnnotationToSpec(args.jobId, ann, args.answerText)
		if (spec) specs.push(spec)
	}
	if (specs.length === 0) return

	args.editor.transact((view) => {
		for (const spec of specs) {
			applyAnnotationMark(view, spec.questionId, spec.mark)
		}
	})
}

/** Convert a PendingAnnotation to an AnnotationSpec ready for `applyAnnotationMark`. */
function pendingAnnotationToSpec(
	jobId: string,
	a: PendingAnnotation,
	answerText: string,
): AnnotationSpec | null {
	// Belt-and-suspenders sanity check: the pending annotation already passed
	// `indexOf`-based validation in `annotateOneQuestion`. We re-verify here
	// in case the answerText drifted between grading and dispatch (e.g.
	// teacher edits during the grading window).
	if (a.charStart < 0 || a.charEnd <= a.charStart) return null
	if (a.charEnd > answerText.length) return null
	if (answerText.slice(a.charStart, a.charEnd) !== a.phrase) return null

	const signal = signalFromPending(a)
	if (!signal) return null

	const sentiment = (a.sentiment ?? "neutral") as
		| "positive"
		| "negative"
		| "neutral"

	// Stable across re-runs of grading on the same submission so duplicate
	// applications no-op idempotently downstream.
	const annotationId = `${jobId}:${a.questionId}:${a.sortOrder}`

	const payload = a.payload as Record<string, unknown>
	const attrs: Record<string, unknown> = {
		annotationId,
		reason: payload.reason ?? null,
		// Scan-side metadata carried for now so `deriveAnnotationsFromDoc`
		// gets the bbox without re-aligning. Slated for removal once the
		// editor + projection layer migrate to the ocrToken-hull fallback.
		scanBbox: a.bbox,
		scanPageOrder: a.pageOrder,
		scanTokenStartId: a.anchorTokenStartId,
		scanTokenEndId: a.anchorTokenEndId,
	}
	if (payload.ao_category) {
		attrs.ao_category = payload.ao_category
		attrs.ao_display = payload.ao_display ?? payload.ao_category
		attrs.ao_quality = payload.ao_quality ?? "valid"
	}
	if (payload.comment) attrs.comment = payload.comment
	if (a.overlayType === "chain") {
		attrs.chainType = payload.chainType ?? "reasoning"
		attrs.phrase = payload.phrase ?? null
	}

	const mark: AnnotationMarkSpec = {
		signal,
		sentiment,
		from: a.charStart,
		to: a.charEnd,
		attrs,
	}

	return { questionId: a.questionId, mark }
}

function signalFromPending(a: PendingAnnotation): AnnotationSignal | null {
	if (a.overlayType === "chain") return "chain"
	const raw = (a.payload as { signal?: string }).signal
	if (raw && isMarkSignal(raw)) return raw
	return null
}
