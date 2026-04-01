import { Type } from "@google/genai"

export const MARK_SCHEME_SCHEMA = {
	type: Type.OBJECT,
	properties: {
		questions: {
			type: Type.ARRAY,
			items: {
				type: Type.OBJECT,
				properties: {
					question_text: { type: Type.STRING },
					question_type: { type: Type.STRING },
					total_marks: { type: Type.INTEGER },
					ao_allocations: {
						type: Type.ARRAY,
						nullable: true,
						description:
							"AO codes and mark values from the 'Marks for this question:' header line. Include ONLY codes explicitly printed in the document — do NOT infer or add codes not present.",
						items: {
							type: Type.OBJECT,
							properties: {
								ao_code: {
									type: Type.STRING,
									description:
										"The AO code exactly as printed, e.g. AO1, AO2, AO3",
								},
								marks: {
									type: Type.INTEGER,
									description: "Number of marks allocated to this AO",
								},
							},
							required: ["ao_code", "marks"],
						},
					},
					mark_points: {
						type: Type.ARRAY,
						items: {
							type: Type.OBJECT,
							properties: {
								description: { type: Type.STRING },
								criteria: { type: Type.STRING },
								points: { type: Type.INTEGER },
							},
							required: ["description", "criteria", "points"],
						},
					},
					acceptable_answers: {
						type: Type.ARRAY,
						items: { type: Type.STRING },
					},
					guidance: { type: Type.STRING },
					question_number: { type: Type.STRING },
					correct_option: { type: Type.STRING },
					options: {
						type: Type.ARRAY,
						nullable: true,
						description:
							"For multiple choice questions: the answer options (A, B, C, D). Only include when question_type is multiple_choice.",
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
					marking_method: {
						type: Type.STRING,
						nullable: true,
						description: "multiple_choice | level_of_response | point_based",
					},
					command_word: { type: Type.STRING, nullable: true },
					items_required: { type: Type.INTEGER, nullable: true },
					levels: {
						type: Type.ARRAY,
						nullable: true,
						items: {
							type: Type.OBJECT,
							properties: {
								level: { type: Type.INTEGER },
								mark_range: {
									type: Type.ARRAY,
									items: { type: Type.INTEGER },
								},
								descriptor: { type: Type.STRING },
								ao_requirements: {
									type: Type.ARRAY,
									items: { type: Type.STRING },
									nullable: true,
								},
							},
							required: ["level", "mark_range", "descriptor"],
						},
					},
					caps: {
						type: Type.ARRAY,
						nullable: true,
						items: {
							type: Type.OBJECT,
							properties: {
								condition: { type: Type.STRING },
								max_level: { type: Type.INTEGER, nullable: true },
								max_mark: { type: Type.INTEGER, nullable: true },
								reason: { type: Type.STRING },
							},
							required: ["condition", "reason"],
						},
					},
					matched_question_id: {
						type: Type.STRING,
						nullable: true,
						description:
							"The id of the matching question from the EXISTING QUESTIONS list provided in the prompt, or null if no match was found. Only set this when you are confident the question numbers and/or content match.",
					},
				},
				required: [
					"question_text",
					"question_type",
					"total_marks",
					"mark_points",
				],
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
	},
	required: [
		"title",
		"subject",
		"exam_board",
		"total_marks",
		"duration_minutes",
	],
}
