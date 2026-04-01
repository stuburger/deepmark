import { Type } from "@google/genai"

export const QUESTION_PAPER_SCHEMA = {
	type: Type.OBJECT,
	properties: {
		questions: {
			type: Type.ARRAY,
			items: {
				type: Type.OBJECT,
				properties: {
					question_text: { type: Type.STRING },
					question_type: {
						type: Type.STRING,
						description: "written | multiple_choice",
					},
					total_marks: { type: Type.INTEGER },
					question_number: { type: Type.STRING },
					options: {
						type: Type.ARRAY,
						nullable: true,
						description:
							"For multiple choice questions: the answer options. Only include when question_type is multiple_choice.",
						items: {
							type: Type.OBJECT,
							properties: {
								option_label: {
									type: Type.STRING,
									description: "The option label, e.g. A, B, C, D",
								},
								option_text: {
									type: Type.STRING,
									description: "The full text of this answer option",
								},
							},
							required: ["option_label", "option_text"],
						},
					},
				},
				required: ["question_text", "total_marks"],
			},
		},
	},
	required: ["questions"],
}

export const EXAM_PAPER_METADATA_SCHEMA = {
	type: Type.OBJECT,
	properties: {
		title: { type: Type.STRING },
		subject: { type: Type.STRING },
		exam_board: { type: Type.STRING },
		total_marks: { type: Type.INTEGER },
		duration_minutes: { type: Type.INTEGER },
		year: { type: Type.INTEGER, nullable: true },
		paper_number: { type: Type.INTEGER, nullable: true },
	},
	required: [
		"title",
		"subject",
		"exam_board",
		"total_marks",
		"duration_minutes",
	],
}
