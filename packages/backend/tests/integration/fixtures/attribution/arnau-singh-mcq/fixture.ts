import * as path from "node:path"
import type { FixtureSpec } from "../shared-types"

/**
 * Arnau Singh — same AQA Business paper as `jack-kinnard-mcq` (exam paper
 * `cmo1n4g3s000102lbvirlzyl6`, submission `cmoy98ffn05so02l5m4xuu28r`,
 * page 2).
 *
 * Why this fixture exists
 * -----------------------
 * Third printed-checkbox MCQ data point on the same paper. Different
 * handwriting style from Jack and Ahmed — the ticks here are slightly
 * messier, with longer strokes that escape the checkbox. Useful for
 * variance: catches regressions where the model's tick detection is
 * brittle to specific stroke shapes.
 *
 * Picks: Q01.1=C ✓, Q01.2=B ✓, Q01.3=A ✓ (all correct).
 */

const PREFIX = "test-arnau-singh-mcq"

export const ARNAU_SINGH_MCQ_FIXTURE: FixtureSpec = {
	name: "arnau-singh-mcq",
	userId: `${PREFIX}-user`,
	examPaperId: `${PREFIX}-exam`,
	sectionId: `${PREFIX}-section`,
	dir: path.resolve(__dirname),
	questions: [
		{
			id: `${PREFIX}-q01.1`,
			question_number: "01.1",
			question_type: "multiple_choice",
			text: "Which of the following types of business does not operate in the tertiary sector?",
			points: 1,
			multiple_choice_options: [
				{ option_label: "A", option_text: "Distribution" },
				{ option_label: "B", option_text: "Banking" },
				{ option_label: "C", option_text: "Farming" },
				{ option_label: "D", option_text: "Clothing retailer" },
			],
		},
		{
			id: `${PREFIX}-q01.2`,
			question_number: "01.2",
			question_type: "multiple_choice",
			text: "A business has decided to take greater environmental responsibility when making decisions. What is the benefit to the business of doing this?",
			points: 1,
			multiple_choice_options: [
				{ option_label: "A", option_text: "It may increase costs" },
				{ option_label: "B", option_text: "Customer loyalty will improve" },
				{ option_label: "C", option_text: "Employees may look for other jobs" },
				{
					option_label: "D",
					option_text: "It will help prevent global warming",
				},
			],
		},
		{
			id: `${PREFIX}-q01.3`,
			question_number: "01.3",
			question_type: "multiple_choice",
			text: "Which of the following would be a reason for a new business to prepare a business plan?",
			points: 1,
			multiple_choice_options: [
				{
					option_label: "A",
					option_text: "Banks are more likely to provide loans",
				},
				{ option_label: "B", option_text: "It is a legal requirement" },
				{ option_label: "C", option_text: "It will encourage repeat business" },
				{
					option_label: "D",
					option_text: "It will cost time and money to prepare",
				},
			],
		},
		{
			id: `${PREFIX}-q01.4`,
			question_number: "01.4",
			question_type: "written",
			text: "Identify two advantages of a business changing from a sole trader to an Ltd.",
			points: 2,
			multiple_choice_options: [],
		},
	],
	pages: [{ order: 2, mime_type: "image/jpeg", image_filename: "page2.jpg" }],
	expectations: {
		expectedMcqAnswers: [
			{ questionNumber: "01.1", expectedLetter: "C" },
			{ questionNumber: "01.2", expectedLetter: "B" },
			{ questionNumber: "01.3", expectedLetter: "A" },
		],
	},
}
