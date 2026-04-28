import { z } from "zod/v4"

export const MarkSchemeSchema = z.object({
	questions: z.array(
		z.object({
			question_text: z.string(),
			question_type: z.string(),
			total_marks: z.number().int(),
			ao_allocations: z
				.array(
					z.object({
						ao_code: z
							.string()
							.describe("The AO code exactly as printed, e.g. AO1, AO2, AO3"),
						marks: z
							.number()
							.int()
							.describe("Number of marks allocated to this AO"),
					}),
				)
				.nullable()
				.optional()
				.describe(
					"AO codes and mark values from the 'Marks for this question:' header line. Include ONLY codes explicitly printed in the document — do NOT infer or add codes not present.",
				),
			mark_points: z.array(
				z.object({
					// Every emitted mark_point is implicitly worth exactly 1 mark —
					// the grader scores them binarily. A 2-mark question must produce
					// two distinct mark_points, never one entry "worth 2". The grader
					// prompt reads `criteria` exclusively; an empty value would
					// silently produce unguided marking, so it's required.
					criteria: z.string(),
				}),
			),
			acceptable_answers: z.array(z.string()).optional(),
			guidance: z.string().optional(),
			question_number: z.string().optional(),
			correct_option: z.string().optional(),
			options: z
				.array(
					z.object({
						option_label: z
							.string()
							.describe("The option label, e.g. A, B, C, D"),
						option_text: z
							.string()
							.describe("The full text of this answer option"),
					}),
				)
				.nullable()
				.optional()
				.describe(
					"For multiple choice questions: the answer options (A, B, C, D). Only include when question_type is multiple_choice.",
				),
			marking_method: z
				.string()
				.nullable()
				.optional()
				.describe("multiple_choice | level_of_response | point_based"),
			command_word: z.string().nullable().optional(),
			items_required: z.number().int().nullable().optional(),
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
				.optional(),
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
					"For level_of_response questions: the COMPLETE mark scheme as markdown — level descriptors, indicative content, exemplar answers, marker notes, caps, command word. For other question types: null.",
				),
			matched_question_id: z
				.string()
				.nullable()
				.optional()
				.describe(
					"The id of the matching question from the EXISTING QUESTIONS list provided in the prompt, or null if no match was found.",
				),
		}),
	),
})

/** Derived from MarkSchemeSchema — one question entry from the extraction response. */
export type ExtractedQuestion = z.infer<
	typeof MarkSchemeSchema
>["questions"][number]

export const ExamPaperMetadataSchema = z.object({
	title: z.string(),
	subject: z.string(),
	exam_board: z.string(),
	total_marks: z.number().int(),
	duration_minutes: z.number().int(),
	year: z.number().int().nullable().optional(),
})
