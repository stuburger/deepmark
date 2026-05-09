import * as path from "node:path"
import type { FixtureSpec } from "../shared-types"

/**
 * Jack Kinnard — single-page MCQ extraction fixture lifted from the production
 * AQA Business submission `cmoy98ilf0egk02l5kfkhnaej` (exam paper
 * `cmo1n4g3s000102lbvirlzyl6`, batch `cmo1n8mm0000102l4d3myk32y`, page 2).
 *
 * Why this fixture exists
 * -----------------------
 * This is a *printed* checkbox MCQ paper — Cloud Vision picks up every printed
 * option letter (A, B, C, D) and option text (Distribution, Banking, Farming,
 * ...) as real word tokens. On these papers the attribution pass tends to
 * leak the printed option text adjacent to the student's tick into
 * `answer_text`, and the per-page Gemini MCQ detection occasionally misses
 * the tick — so `resolveMcqAnswers` has nothing clean to overwrite with.
 *
 * The student here got 01.1, 01.2, 01.3 *correct* (C, B, A) by ticking the
 * right checkboxes. In production, all three were stored as raw option text
 * (`"Farming"`, `"Customer loyalty will improve"`, `"Banks are more likely
 * to provide loans"`) and graded zero.
 *
 * What the eval asserts
 * ---------------------
 * After the full extract pipeline runs (per-page Gemini OCR + attribution +
 * `resolveMcqAnswers`), each MCQ question's `answer_text` must equal the
 * expected option letter exactly — `"C"` for 01.1, `"B"` for 01.2, `"A"`
 * for 01.3. Anything longer than 5 chars or containing prose fails.
 *
 * Scope
 * -----
 * Page 2 only — that's where the MCQs live. 01.4 is included as a written
 * question on the same page so attribution has a realistic non-MCQ target;
 * pages 1 and 3–7 are not part of the bug surface and are excluded to keep
 * each eval run cheap.
 */

const PREFIX = "test-jack-kinnard-mcq"

export const JACK_KINNARD_MCQ_FIXTURE: FixtureSpec = {
	name: "jack-kinnard-mcq",
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
				{
					option_label: "C",
					option_text: "It will encourage repeat business",
				},
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
