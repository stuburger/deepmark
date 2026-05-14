/**
 * Threshold below which a segmented script is surfaced in the wizard's
 * soft-nudge banner ("n segment(s) looked uncertain — worth an eyeball").
 *
 * NEVER a gate: low-confidence scripts still auto-confirm. The marking
 * flow is the real review.
 *
 * Lives in @mcp-gcse/shared so the segmentation pipeline (backend Lambdas)
 * and the wizard surface (Next.js) read from a single source of truth.
 * Tune by editing this constant once the segmentation-evals histogram
 * suggests a new floor. Per the project workflow rule: tighten upward as
 * the model improves, never loosen.
 */
export const LOW_CONFIDENCE_NUDGE_THRESHOLD = 0.85

export function isLowConfidence(confidence: number | null): boolean {
	if (confidence === null) return false
	return confidence < LOW_CONFIDENCE_NUDGE_THRESHOLD
}
