import type { PaperBundle } from "./schema"

/**
 * Pure validation gate for the LLM bundle output. The Zod schema already
 * enforces shape; this layer enforces the semantic invariants the persister
 * relies on:
 *   - At least one section, each with at least one question.
 *   - Every question carries a mark scheme.
 *   - Per-method shape:
 *       point_based       ⇒ mark_points present
 *       level_of_response ⇒ lor_extraction present with 1+ dimensions, each
 *                           with 1+ levels; total marks across dimensions
 *                           match the question total
 *       deterministic     ⇒ correct_option set
 *
 * Lives separately from `persist.ts` so it can be unit-tested without a DB.
 */
export type BundleValidation = { ok: true } | { ok: false; error: string }

export function validateBundle(bundle: PaperBundle): BundleValidation {
	if (bundle.sections.length === 0) {
		return { ok: false, error: "Bundle returned zero sections" }
	}
	for (const section of bundle.sections) {
		if (section.questions.length === 0) {
			return {
				ok: false,
				error: `Section "${section.title}" has no questions`,
			}
		}
		for (const q of section.questions) {
			const label = q.question_number ?? q.question_text.slice(0, 40)
			if (!q.mark_scheme) {
				return { ok: false, error: `Question "${label}" missing mark_scheme` }
			}
			const method = q.mark_scheme.marking_method
			if (method === "point_based" && q.mark_scheme.mark_points.length === 0) {
				return {
					ok: false,
					error: `Point-based question "${label}" has no mark_points`,
				}
			}
			if (method === "level_of_response") {
				const lor = q.mark_scheme.lor_extraction
				if (!lor) {
					return {
						ok: false,
						error: `Level-of-response question "${label}" has no lor_extraction`,
					}
				}
				if (lor.ao_dimensions.length === 0) {
					return {
						ok: false,
						error: `Level-of-response question "${label}" lor_extraction has no ao_dimensions`,
					}
				}
				for (const dim of lor.ao_dimensions) {
					if (dim.levels.length === 0) {
						return {
							ok: false,
							error: `Level-of-response question "${label}" dimension "${dim.ao_code}" has no levels`,
						}
					}
				}
				const dimensionsTotal = lor.ao_dimensions.reduce(
					(sum, d) => sum + d.marks,
					0,
				)
				if (dimensionsTotal !== q.total_marks) {
					return {
						ok: false,
						error: `Level-of-response question "${label}" ao_dimensions sum to ${dimensionsTotal} but question total_marks is ${q.total_marks}`,
					}
				}
			}
			if (method === "deterministic" && !q.mark_scheme.correct_option) {
				return {
					ok: false,
					error: `Deterministic question "${label}" has no correct_option`,
				}
			}
		}
	}
	return { ok: true }
}
