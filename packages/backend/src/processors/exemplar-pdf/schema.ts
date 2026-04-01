import { Type } from "@google/genai"

export const EXEMPLAR_SCHEMA = {
	type: Type.OBJECT,
	properties: {
		questions: {
			type: Type.ARRAY,
			items: {
				type: Type.OBJECT,
				properties: {
					question_text: { type: Type.STRING },
					exemplars: {
						type: Type.ARRAY,
						items: {
							type: Type.OBJECT,
							properties: {
								level: { type: Type.INTEGER },
								is_fake_exemplar: { type: Type.BOOLEAN },
								answer_text: { type: Type.STRING },
								word_count: { type: Type.INTEGER },
								why_criteria: {
									type: Type.ARRAY,
									items: { type: Type.STRING },
								},
								mark_band: { type: Type.STRING },
								expected_score: { type: Type.INTEGER },
							},
							required: [
								"level",
								"is_fake_exemplar",
								"answer_text",
								"why_criteria",
							],
						},
					},
				},
				required: ["question_text", "exemplars"],
			},
		},
	},
	required: ["questions"],
}
