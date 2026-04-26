import type { PendingAnnotation } from "@/lib/annotations/types"
import type { AnnotationMarkSpec } from "@/lib/collab/editor-ops"
import { applyAnnotationMark } from "@/lib/collab/editor-ops"
import type { AnnotationSpec } from "@/lib/collab/editor-seed"
import type { HeadlessEditor } from "@/lib/collab/headless-editor"
import {
	type AnnotationSignal,
	type PageToken,
	alignTokensToAnswer,
	isMarkSignal,
} from "@mcp-gcse/shared"

/**
 * Dispatch all AI annotations for a *single* question as PM `addMark`
 * transactions on the supplied editor. Resolves character ranges via
 * `alignTokensToAnswer` (same algorithm the web client uses). Annotation
 * marks carry the original scan token + bbox metadata so the round-trip via
 * `deriveAnnotationsFromDoc` is lossless.
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
	tokens: PageToken[]
	annotations: PendingAnnotation[]
}): void {
	if (args.annotations.length === 0) return
	if (args.answerText.length === 0 || args.tokens.length === 0) return

	const alignment = alignTokensToAnswer(args.answerText, args.tokens)
	const specs: AnnotationSpec[] = []
	for (const ann of args.annotations) {
		const spec = pendingAnnotationToSpec(args.jobId, ann, alignment.tokenMap)
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
	tokenMap: Record<string, { start: number; end: number }>,
): AnnotationSpec | null {
	if (!a.anchorTokenStartId || !a.anchorTokenEndId) return null
	const startOffset = tokenMap[a.anchorTokenStartId]
	const endOffset = tokenMap[a.anchorTokenEndId]
	if (!startOffset || !endOffset) return null
	if (startOffset.start >= endOffset.end) return null

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
		// Carry scan metadata so deriveAnnotationsFromDoc can reverse-resolve
		// the bbox without needing the alignment map again.
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
		from: startOffset.start,
		to: endOffset.end,
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
