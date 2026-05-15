import { z } from "zod/v4"

// ── SQS message payload ──────────────────────────────────────────────────────

export const PaperBundleJobPayloadSchema = z.object({
	sessionId: z.string(),
})

export type PaperBundleJobPayload = z.infer<typeof PaperBundleJobPayloadSchema>

// ── Gemini structured-output schema ──────────────────────────────────────────

// Extraction-time intermediate for level_of_response questions. Captures the
// per-AO grids structurally so the persister can deterministically render
// canonical markdown into `content`. Never stored — the markdown is the
// canonical form, the intermediate is ephemeral. Same input always produces
// the same markdown; new subject quirks land in `extras` and are appended
// verbatim by the renderer without a schema change.
const LoRExtractionSchema = z.object({
	indicative_content: z
		.string()
		.describe(
			"Multi-paragraph markdown summary of the expected response: what a strong answer looks like, key ideas, exemplar phrases. Verbatim from the MS where printed.",
		),
	ao_dimensions: z
		.array(
			z.object({
				ao_code: z
					.string()
					.describe(
						"Assessment Objective code as printed (e.g. 'AO5', 'AO6'). Use 'Overall' when the MS uses a single grid with no AO breakdown.",
					),
				marks: z.number().int().describe("Maximum marks for this dimension."),
				description: z
					.string()
					.describe(
						"Short label printed alongside the AO (e.g. 'Content / structure / register'). Empty string if none printed.",
					),
				levels: z
					.array(
						z.object({
							level: z.number().int().describe("Level number (1, 2, 3, ...)."),
							mark_range: z
								.array(z.number().int())
								.describe(
									"Two-element [min, max] inclusive mark range for this level.",
								),
							descriptor_bullets: z
								.array(z.string())
								.describe(
									"Each printed descriptor bullet for this level, verbatim, one per array entry.",
								),
						}),
					)
					.describe(
						"Levels for this dimension, in order from lowest to highest.",
					),
			}),
		)
		.describe(
			"One entry per assessment dimension. Single-skill LoR = length 1. Multi-skill (parallel grids summed, e.g. Edexcel English Lang AO5+AO6) = length 2+.",
		),
	marker_notes: z
		.string()
		.nullable()
		.describe(
			"Caps, exceptions, level-boundary guidance, command-word hints printed alongside the grids. Null if none.",
		),
	extras: z
		.string()
		.nullable()
		.describe(
			"Catch-all for any board-specific marker guidance that doesn't fit the above (shared-grid headers, paper-wide notes referenced by this question, etc.). Verbatim markdown. Null if none.",
		),
})

const MarkSchemeBlockSchema = z.object({
	marking_method: z
		.enum(["deterministic", "point_based", "level_of_response"])
		.describe(
			"deterministic = MCQ (a single correct option). point_based = each mark_point worth 1 mark, awarded on match. level_of_response = AQA-style level descriptors with caps.",
		),
	mark_points: z
		.array(
			z.object({
				criteria: z
					.string()
					.describe(
						"One mark-worthy criterion. Each criterion is worth exactly 1 mark — never combine two marks into one entry. Empty array for level_of_response.",
					),
			}),
		)
		.describe(
			"Required for point_based. Empty array for level_of_response and deterministic.",
		),
	acceptable_answers: z.array(z.string()).optional(),
	guidance: z
		.string()
		.nullable()
		.optional()
		.describe(
			"Free-form additional marker guidance for this question. Null if none printed.",
		),
	correct_option: z
		.string()
		.nullable()
		.optional()
		.describe(
			"Single option label (e.g. 'B') for deterministic MCQ; null otherwise.",
		),
	ao_allocations: z
		.array(
			z.object({
				ao_code: z.string(),
				marks: z.number().int(),
			}),
		)
		.nullable()
		.optional()
		.describe(
			"Canonical dimensionality field. For level_of_response: ALWAYS populate when AO weights are printed (single grid: one entry; parallel grids: one entry per dimension, e.g. Edexcel English Lang Sec B = [{AO5, 24}, {AO6, 16}]). For point_based / deterministic: optional. Never invent.",
		),
	lor_extraction: LoRExtractionSchema.nullable()
		.optional()
		.describe(
			"REQUIRED for level_of_response questions. Structured intermediate the persister deterministically renders into mark_scheme.content. Null for point_based / deterministic.",
		),
	caps: z
		.array(
			z.object({
				condition: z.string(),
				max_level: z.number().int().nullable().optional(),
				max_mark: z.number().int().nullable().optional(),
				reason: z.string(),
			}),
		)
		.nullable()
		.optional(),
	content: z
		.string()
		.nullable()
		.optional()
		.describe(
			"DEPRECATED for level_of_response: leave null. The persister renders content from lor_extraction. For point_based / deterministic: optional free-form markdown that supplements mark_points / correct_option.",
		),
})

const QuestionBlockSchema = z.object({
	question_text: z
		.string()
		.describe(
			"The question itself — the instruction/prompt the student must answer. MUST NOT include any case study / Item / Source / Figure text. Put that under section.stimuli.",
		),
	question_type: z
		.enum(["written", "multiple_choice"])
		.describe(
			"multiple_choice when the question presents lettered options; written otherwise.",
		),
	total_marks: z
		.number()
		.int()
		.describe("Total marks available for this question."),
	printed_marks: z
		.number()
		.int()
		.nullable()
		.describe(
			"The marks number printed in parentheses next to this question (e.g. 2 from '(2 marks)'). Null if not printed. Do NOT infer — copy ONLY what is literally printed adjacent to the question.",
		),
	question_number: z
		.string()
		.nullable()
		.describe(
			"Question number as printed (e.g. '1', '1a', '2.iii'). Null if not numbered.",
		),
	stimulus_labels: z
		.array(z.string())
		.optional()
		.default([])
		.describe(
			"Labels of stimuli (defined in the enclosing section.stimuli) that this question references. Empty if standalone.",
		),
	options: z
		.array(
			z.object({
				option_label: z.string(),
				option_text: z.string(),
			}),
		)
		.nullable()
		.optional()
		.describe(
			"For multiple_choice only: the answer options. Null/omitted for written.",
		),
	mark_scheme: MarkSchemeBlockSchema,
})

const StimulusBlockSchema = z.object({
	label: z
		.string()
		.describe(
			"Stimulus label EXACTLY as printed — 'Item A', 'Source B', 'Figure 1', etc.",
		),
	content_type: z.enum(["text", "table"]).optional().default("text"),
	content: z
		.string()
		.describe(
			"For text: the full content, preserving paragraphs. For table: a GitHub-flavoured markdown pipe table.",
		),
})

const SectionChoiceSchema = z
	.object({
		kind: z
			.enum(["all", "any_n_of"])
			.describe(
				"all = every question in this section must be answered. any_n_of = the student chooses n questions from the alternatives in this section (e.g. 'Answer ONE of the following').",
			),
		n: z
			.number()
			.int()
			.min(1)
			.nullable()
			.describe(
				"Required when kind = any_n_of: number of alternatives the student must answer (1 for 'Answer ONE'). Null when kind = all.",
			),
	})
	.describe(
		"Describes how the section's questions combine into the section total. Default to {kind:'all', n:null} unless the section header explicitly instructs the student to choose.",
	)

const SectionBlockSchema = z.object({
	title: z
		.string()
		.describe(
			"Section header as printed (e.g. 'Section A'). If the paper has no section headers, use 'Section 1'.",
		),
	description: z.string().nullable().optional(),
	total_marks: z.number().int(),
	printed_total_marks: z.number().int().nullable(),
	choice: SectionChoiceSchema.optional().default({ kind: "all", n: null }),
	stimuli: z.array(StimulusBlockSchema).optional().default([]),
	questions: z.array(QuestionBlockSchema),
})

export const PaperBundleSchema = z.object({
	metadata: z.object({
		title: z
			.string()
			.describe(
				"Full exam paper title. If the title isn't printed clearly, synthesise one in the form '<Board> <Subject> Paper <N> (<Tier>) <Year>' from whatever IS visible.",
			),
		subject: z.enum([
			"biology",
			"chemistry",
			"physics",
			"english",
			"english_literature",
			"mathematics",
			"history",
			"geography",
			"computer_science",
			"french",
			"spanish",
			"religious_studies",
			"business",
		]),
		exam_board: z.string().describe("e.g. AQA, OCR, Edexcel, WJEC, Cambridge"),
		total_marks: z.number().int(),
		printed_total_marks: z.number().int().nullable(),
		duration_minutes: z.number().int(),
		year: z.number().int(),
		paper_number: z.number().int().nullable(),
		tier: z.enum(["foundation", "higher"]).nullable(),
	}),
	sections: z
		.array(SectionBlockSchema)
		.describe(
			"All sections in paper order. A paper with no explicit section dividers must still return exactly one section.",
		),
})

export type PaperBundle = z.infer<typeof PaperBundleSchema>
export type PaperBundleQuestion = z.infer<typeof QuestionBlockSchema>
export type PaperBundleMarkScheme = z.infer<typeof MarkSchemeBlockSchema>
export type PaperBundleLoRExtraction = z.infer<typeof LoRExtractionSchema>

export { LoRExtractionSchema }
