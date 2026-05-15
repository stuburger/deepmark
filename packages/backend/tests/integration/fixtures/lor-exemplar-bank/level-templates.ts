import { renderLoRMarkScheme } from "../../../../src/processors/paper-bundle/render-mark-scheme"
import type { PaperBundleLoRExtraction } from "../../../../src/processors/paper-bundle/schema"
import type { AqaLevelTemplateKey } from "./types"

/**
 * Generic AQA-style level descriptor templates, keyed by (totalMarks, commandWord).
 *
 * Why generic: AQA Business mark schemes for these question types use the SAME
 * level descriptors across every question of that shape — only indicative
 * content varies per question. The bank's per-question marks reflect this:
 * a 9-mark Evaluate L1 looks the same structurally whether it's BrightBean or
 * ByteTech. The marker reads the level descriptors; we vary indicative content
 * only.
 *
 * Each template is run through renderLoRMarkScheme — the same deterministic
 * renderer the real bundle persister uses. That guarantees the marker sees
 * exactly the same markdown shape as production: this fixture is a faithful
 * proxy for "what would the bundle extractor produce for an AQA Business
 * paper", not an arbitrary fixture format.
 *
 * ao_code: we use "Overall" for the single-skill virtual dimension. ao_marks
 * sums to the question total. This is the same convention the bundle uses
 * for printed-no-AO papers (ao_allocations on the MarkScheme row stays
 * empty — only ao_dimensions in the intermediate carries the synthetic).
 */

type LevelTemplate = Omit<PaperBundleLoRExtraction, "indicative_content">

function buildTemplate(args: {
	marks: number
	bullets: Array<{
		level: number
		mark_range: [number, number]
		descriptor_bullets: string[]
	}>
	marker_notes: string | null
}): LevelTemplate {
	return {
		ao_dimensions: [
			{
				ao_code: "Overall",
				marks: args.marks,
				description: "AO1 + AO2 + AO3 holistic banded grid",
				levels: args.bullets,
			},
		],
		marker_notes: args.marker_notes,
		extras: null,
	}
}

const AQA_LEVEL_TEMPLATES: Record<AqaLevelTemplateKey, LevelTemplate> = {
	"aqa-4-mark": buildTemplate({
		marks: 4,
		bullets: [
			{
				level: 1,
				mark_range: [1, 2],
				descriptor_bullets: [
					"Generic statement(s) with no business context.",
					"No chain of reasoning — student names an idea without explaining how it produces the desired outcome.",
					"AO1 minimal; AO2 absent or trivial; ideas may be vague or repeated.",
				],
			},
			{
				level: 2,
				mark_range: [2, 3],
				descriptor_bullets: [
					"Reasonable AO1; some AO2 — at least one point shows partial application to the specific business.",
					"Two points present but underdeveloped — consequences for the business stated only briefly.",
					"Reasoning is shallow; chains stop after one step.",
				],
			},
			{
				level: 3,
				mark_range: [4, 4],
				descriptor_bullets: [
					"Two fully-developed points, each explicitly applied to the specific business context.",
					"Clear multi-step chains of reasoning that link the action to a concrete business benefit.",
					"AO2 strong: references specific operational, customer, or financial detail.",
				],
			},
		],
		marker_notes:
			"Cap at Level 2 when the answer is polished in tone but the analysis is generic ('customers like good shops', 'looks professional', repeated phrasing). Surface polish without depth never reaches Level 3.",
	}),

	"aqa-6-mark-justify": buildTemplate({
		marks: 6,
		bullets: [
			{
				level: 1,
				mark_range: [1, 2],
				descriptor_bullets: [
					"Very simple statements; AO1 only or AO1 with negligible AO2.",
					"No chain of reasoning linking the proposed action to a justified judgement.",
					"Any 'judgement' is generic ('it might work') and not tied to specific consequences.",
				],
			},
			{
				level: 2,
				mark_range: [3, 4],
				descriptor_bullets: [
					"AO1 correct; AO2 partially applied to the business.",
					"One or both sides considered but shallow — consequences sketched, not chained.",
					"Basic judgement present but unsubstantiated by detailed reasoning.",
				],
			},
			{
				level: 3,
				mark_range: [5, 6],
				descriptor_bullets: [
					"AO1 accurate; AO2 well-applied with specific operational/customer/financial detail.",
					"Multi-step chains of reasoning on at least one side, supported by contextual detail.",
					"Clear, contextualised conditional judgement ('it depends if …') tied to the analysis.",
				],
			},
		],
		marker_notes:
			"A Justify question demands a judgement supported by reasoning. Cap at Level 2 when the conclusion is unjustified or generic ('customers like fast services'). Surface polish without 'it depends' / contextual contingency cannot reach Level 3.",
	}),

	"aqa-6-mark-analyse": buildTemplate({
		marks: 6,
		bullets: [
			{
				level: 1,
				mark_range: [1, 2],
				descriptor_bullets: [
					"Vague, generic statements; minimal AO2.",
					"No real chain of reasoning — student names a benefit/drawback without developing the consequence.",
					"Repetition of similar points; no concrete operational detail.",
				],
			},
			{
				level: 2,
				mark_range: [3, 4],
				descriptor_bullets: [
					"Two points developed with some AO2.",
					"Consequences stated but shallow — chains stop after one step.",
					"Application present but not deeply tied to the specific business context.",
				],
			},
			{
				level: 3,
				mark_range: [5, 6],
				descriptor_bullets: [
					"Two points developed with deep AO2 and strong, multi-step chains of reasoning.",
					"Multiple consequences per point; explicit application to the specific business.",
					"No evaluation required for Analyse — judgement is not necessary at any Level.",
				],
			},
		],
		marker_notes:
			"Analyse does NOT require a judgement or 'it depends'. Cap at Level 2 when application is shallow ('people are busy', 'looks professional', repeated reasoning), regardless of polish or length.",
	}),

	"aqa-9-mark-evaluate": buildTemplate({
		marks: 9,
		bullets: [
			{
				level: 1,
				mark_range: [1, 3],
				descriptor_bullets: [
					"Basic AO1 only; AO2 thin or absent.",
					"No chains of reasoning; no proper evaluation.",
					"Any judgement is meaningless ('might work or might not').",
				],
			},
			{
				level: 2,
				mark_range: [4, 6],
				descriptor_bullets: [
					"AO1 correct; AO2 partially applied with some business-specific detail.",
					"Evaluation present but simple; judgement weak or unjustified.",
					"Missing deep multi-step reasoning; balance limited.",
				],
			},
			{
				level: 3,
				mark_range: [7, 9],
				descriptor_bullets: [
					"Strong AO1 + AO2 with business-specific operational detail.",
					"Multi-step chains of reasoning on both sides; balanced evaluation.",
					"Proper conditional 'it depends' judgement explicitly tied to the analysis.",
					"Realistic top-band length (250–300 words) typical of a genuine 9-mark script.",
				],
			},
		],
		marker_notes:
			"9-markers are one-sided-with-evaluation — strong scripts develop one position deeply, then weigh against the alternative before reaching a conditional judgement. Cap at Level 2 if the answer is polished but lacks a real 'it depends' contingency or has only single-layer consequences.",
	}),

	"aqa-12-mark-evaluate": buildTemplate({
		marks: 12,
		bullets: [
			{
				level: 1,
				mark_range: [1, 4],
				descriptor_bullets: [
					"AO1 only; no real AO2 (no reference to the specific business).",
					"No analysis, no evaluation, no judgement.",
					"Vague, generic statements.",
				],
			},
			{
				level: 2,
				mark_range: [5, 8],
				descriptor_bullets: [
					"AO1 present; AO2 applied but limited in depth.",
					"Some analysis but no balanced argument.",
					"Judgement too simple or absent.",
				],
			},
			{
				level: 3,
				mark_range: [9, 10],
				descriptor_bullets: [
					"AO1 + AO2 good; AO3 present but not fully developed.",
					"Some evaluation, partly balanced; not multi-layered.",
					"Judgement lacks clear justification or depth.",
				],
			},
			{
				level: 4,
				mark_range: [11, 12],
				descriptor_bullets: [
					"AO1 accurate; AO2 rich and business-specific.",
					"Deep multi-step AO3 with layered consequences and dependency factors.",
					"Fully balanced argument with sophisticated conditional judgement.",
					"Realistic top-band length (400+ words).",
				],
			},
		],
		marker_notes:
			"12-markers are qualitatively different from 9-markers: fully balanced 2-sided argument with heavier evaluation. Cap at Level 3 when the answer is polished but the argument is not balanced, multi-step reasoning is missing, or the judgement is not justified by the preceding analysis. A long, well-written answer that lacks dependency factors and balance cannot reach Level 4.",
	}),
}

/**
 * Renders a complete LoR mark scheme content markdown for the given question,
 * combining its indicative content with the AQA-style level descriptor
 * template. Output is byte-identical for the same (templateKey, indicative)
 * pair — this is the same renderer the bundle persister uses in production.
 */
export function renderTemplateMarkScheme(
	templateKey: AqaLevelTemplateKey,
	indicativeContent: string,
): string {
	const template = AQA_LEVEL_TEMPLATES[templateKey]
	return renderLoRMarkScheme({
		...template,
		indicative_content: indicativeContent,
	})
}

/**
 * Expected mark range from the question's total marks — used by the eval to
 * derive the band ceiling for a given Level. e.g. for aqa-9-mark-evaluate,
 * levelBand(2) = { min: 4, max: 6 }. Returns null when the templateKey has no
 * level at the given index.
 */
export function levelBand(
	templateKey: AqaLevelTemplateKey,
	level: number,
): { min: number; max: number } | null {
	const template = AQA_LEVEL_TEMPLATES[templateKey]
	const dim = template.ao_dimensions[0]
	if (!dim) return null
	const lvl = dim.levels.find((l) => l.level === level)
	if (!lvl) return null
	const [min, max] = lvl.mark_range
	if (min === undefined || max === undefined) return null
	return { min, max }
}
