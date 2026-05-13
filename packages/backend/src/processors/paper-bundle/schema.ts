import { z } from "zod/v4"

// ── SQS message payload ──────────────────────────────────────────────────────

export const PaperBundleJobPayloadSchema = z.object({
	sessionId: z.string(),
})

export type PaperBundleJobPayload = z.infer<typeof PaperBundleJobPayloadSchema>

// ── Gemini structured-output schema ──────────────────────────────────────────

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
		.describe("Single option label (e.g. 'B') for deterministic MCQ; null otherwise."),
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
			"AO codes + mark counts EXACTLY as printed (e.g. AO1=2, AO2=1). Never invent.",
		),
	levels: z
		.array(
			z.object({
				level: z.number().int(),
				mark_range: z.array(z.number().int()),
				descriptor: z.string(),
				ao_requirements: z.array(z.string()).nullable().optional(),
			}),
		)
		.nullable()
		.optional()
		.describe("Required for level_of_response. Null/empty for other methods."),
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
			"For level_of_response: the complete mark scheme rendered as markdown (level descriptors, indicative content, exemplar answers, marker notes, caps, command word). Null for other methods.",
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
	total_marks: z.number().int().describe("Total marks available for this question."),
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
		.describe("Question number as printed (e.g. '1', '1a', '2.iii'). Null if not numbered."),
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
		.describe("Stimulus label EXACTLY as printed — 'Item A', 'Source B', 'Figure 1', etc."),
	content_type: z
		.enum(["text", "table"])
		.optional()
		.default("text"),
	content: z
		.string()
		.describe(
			"For text: the full content, preserving paragraphs. For table: a GitHub-flavoured markdown pipe table.",
		),
})

const SectionBlockSchema = z.object({
	title: z
		.string()
		.describe(
			"Section header as printed (e.g. 'Section A'). If the paper has no section headers, use 'Section 1'.",
		),
	description: z.string().nullable().optional(),
	total_marks: z.number().int(),
	printed_total_marks: z.number().int().nullable(),
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
