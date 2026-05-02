import { z } from "zod/v4"

const QuestionSchema = z.object({
	question_text: z
		.string()
		.describe(
			"The question itself — the instruction/prompt the student must answer. MUST NOT include any case study / Item / Source / Figure text. Put that in stimuli instead.",
		),
	question_type: z.string().optional().describe("written | multiple_choice"),
	total_marks: z.number().int(),
	printed_marks: z
		.number()
		.int()
		.nullable()
		.describe(
			"The marks number printed in parentheses next to this question on the page, e.g. 2 from '(2 marks)'. Null if no parenthetical mark count is printed next to this specific question. Do NOT infer from context, surrounding questions, or section totals — copy ONLY what is literally printed adjacent to this question.",
		),
	question_number: z.string().optional(),
	stimulus_labels: z
		.array(z.string())
		.optional()
		.default([])
		.describe(
			"Labels of stimuli (defined in the enclosing section.stimuli) that this question references. E.g. ['Item A'] for a question that says 'Read Item A and answer…'. Empty array if the question is standalone.",
		),
	options: z
		.array(
			z.object({
				option_label: z.string().describe("The option label, e.g. A, B, C, D"),
				option_text: z.string().describe("The full text of this answer option"),
			}),
		)
		.nullable()
		.optional()
		.describe(
			"For multiple choice questions: the answer options. Only include when question_type is multiple_choice.",
		),
})

const StimulusSchema = z.object({
	label: z
		.string()
		.describe(
			"Stimulus label as printed on the paper — 'Item A', 'Source B', 'Figure 1', 'Table 2', 'Extract 1', etc.",
		),
	content_type: z
		.enum(["text", "table"])
		.optional()
		.default("text")
		.describe(
			"'text' for a case study / extract / prose source. 'table' for tabular data (rows × columns). 'image' is reserved for future use — do NOT emit it; transcribe figures/diagrams as prose under 'text' when possible.",
		),
	content: z
		.string()
		.describe(
			"For text: the full text of the case study, preserving paragraphs. For table: a GitHub-flavoured markdown pipe-table (header row + separator row + data rows). Never wrap in a code fence.",
		),
})

export const QuestionPaperSchema = z.object({
	sections: z
		.array(
			z.object({
				title: z
					.string()
					.describe(
						"Section header as printed on the paper, e.g. 'Section A', 'Section B', 'Part 1'. If the paper has no section headers, use 'Section 1'.",
					),
				description: z
					.string()
					.nullable()
					.optional()
					.describe(
						"Optional section-level instructions/stimulus printed under the section header (excluding per-question stimulus such as 'Read Item A').",
					),
				total_marks: z
					.number()
					.int()
					.describe(
						"Section total as printed on the paper (e.g. 'Mark for Section A / 25' or 'Total for Section A: 25 marks'). If no section total is printed, use the sum of this section's question marks.",
					),
				printed_total_marks: z
					.number()
					.int()
					.nullable()
					.describe(
						"The section total EXACTLY as printed on the paper — e.g. 25 from 'Mark for Section A / 25' or 'Total for Section A: 25 marks'. Null if no section total is explicitly printed. Do NOT sum the questions yourself; this field is ONLY the literal printed value, used to verify the per-question marks add up correctly.",
					),
				stimuli: z
					.array(StimulusSchema)
					.optional()
					.default([])
					.describe(
						"Case studies / sources / figures introduced in this section. Each stimulus is emitted ONCE here and referenced from questions via stimulus_labels. Empty array if the section has no stimuli.",
					),
				questions: z
					.array(QuestionSchema)
					.describe(
						"Questions that appear within this section, in paper order.",
					),
			}),
		)
		.describe(
			"The paper's sections in the order they appear. A paper with no explicit section dividers must still return exactly one section.",
		),
})

export const QuestionPaperMetadataSchema = z.object({
	title: z.string(),
	subject: z.string(),
	exam_board: z.string(),
	total_marks: z.number().int(),
	printed_total_marks: z
		.number()
		.int()
		.nullable()
		.describe(
			"The paper-wide total EXACTLY as printed on the cover or front matter — e.g. 43 from 'The maximum mark for this paper is 43' or 'Total Mark / 43'. Null if no paper total is explicitly printed. Do NOT sum sections yourself; this field is ONLY the literal printed value, used to verify the section subtotals add up correctly.",
		),
	duration_minutes: z.number().int(),
	year: z.number().int().nullable().optional(),
	paper_number: z.number().int().nullable().optional(),
	tier: z
		.string()
		.nullable()
		.optional()
		.describe(
			"'foundation' or 'higher' if printed on the cover; null if untiered or not visible.",
		),
})
