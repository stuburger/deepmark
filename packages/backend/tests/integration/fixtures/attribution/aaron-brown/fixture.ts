import * as path from "node:path"
import type { FixtureSpec } from "../shared-types"

/**
 * Aaron Brown — 7-page AQA Business submission from production
 * (exam paper `cmo1n4g3s000102lbvirlzyl6`, submission `cmo2yobtb000002jxw56aukng`).
 *
 * Primary eval target: Q02 (12-mark extended writing) spans pages 5, 6, and 7.
 * In production page 6 gets 0/187 tokens attributed — attribution is fully
 * blind on the mid-sentence continuation page with no visible question label.
 *
 * Page 1 is a cover page with just the student's name — it should attract
 * zero attributions (today it attracts 4, all misassigned to Q1).
 */

const PREFIX = "test-aaron-brown"

export const AARON_BROWN_FIXTURE: FixtureSpec = {
	name: "aaron-brown",
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
			text: "Identify two advantages of a business changing from a sole trader to an Ltd..",
			points: 2,
			multiple_choice_options: [],
		},
		{
			id: `${PREFIX}-q1`,
			question_number: "1",
			question_type: "written",
			text: "Analyse two reasons why it is important for Tesco to select the right location for its stores.",
			points: 6,
			multiple_choice_options: [],
		},
		{
			id: `${PREFIX}-q2`,
			question_number: "2",
			question_type: "written",
			text: "Explain what is meant by organic growth",
			points: 2,
			multiple_choice_options: [],
		},
		{
			id: `${PREFIX}-q3`,
			question_number: "3",
			question_type: "written",
			text: "What are the 4 factors of production?",
			points: 4,
			multiple_choice_options: [],
		},
		{
			id: `${PREFIX}-q4`,
			question_number: "4",
			question_type: "written",
			text: "What is meant by the term outsourcing?",
			points: 2,
			multiple_choice_options: [],
		},
		{
			id: `${PREFIX}-q5`,
			question_number: "5",
			question_type: "written",
			text: "What is meant by the term franchising?",
			points: 2,
			multiple_choice_options: [],
		},
		{
			id: `${PREFIX}-q6`,
			question_number: "6",
			question_type: "written",
			text: "List one benefit and one drawback of franchising for a the franchisor",
			points: 2,
			multiple_choice_options: [],
		},
		{
			id: `${PREFIX}-q7`,
			question_number: "7",
			question_type: "written",
			text: "What is meant by the term Business plan?",
			points: 2,
			multiple_choice_options: [],
		},
		{
			id: `${PREFIX}-q8`,
			question_number: "8",
			question_type: "written",
			text: "List 4 possible factors that affect where a business locates?",
			points: 2,
			multiple_choice_options: [],
		},
		{
			id: `${PREFIX}-q9`,
			question_number: "9",
			question_type: "written",
			text: "What is the formula for profit ?",
			points: 2,
			multiple_choice_options: [],
		},
		{
			id: `${PREFIX}-q10`,
			question_number: "10",
			question_type: "written",
			text: "What is the difference between fixed costs and variable costs?",
			points: 2,
			multiple_choice_options: [],
		},
		{
			id: `${PREFIX}-q02`,
			question_number: "02",
			question_type: "written",
			text: "Analyse the impact of expanding using a franchising for the home decorating service rather than the company employing its own additional staff and running the service themselves. In your answer you should analyse the following options for his new home decorating service: franchising the home decorating business (by becoming a franchisor) recruiting managers and decorators to offer their own home decorating business You must evaluate which option would be most profitable for Quality Wallpaper Ltd. Use evidence to support your answer.",
			points: 12,
			multiple_choice_options: [],
		},
	],
	pages: [
		{ order: 1, mime_type: "image/jpeg", image_filename: "page1.jpg" },
		{ order: 2, mime_type: "image/jpeg", image_filename: "page2.jpg" },
		{ order: 3, mime_type: "image/jpeg", image_filename: "page3.jpg" },
		{ order: 4, mime_type: "image/jpeg", image_filename: "page4.jpg" },
		{ order: 5, mime_type: "image/jpeg", image_filename: "page5.jpg" },
		{ order: 6, mime_type: "image/jpeg", image_filename: "page6.jpg" },
		{ order: 7, mime_type: "image/jpeg", image_filename: "page7.jpg" },
	],
	expectations: {
		// Q02 spans pages 5-7. Each page has a different mix of printed
		// question text vs. student handwriting — thresholds reflect that.
		continuation: {
			questionNumber: "02",
			pages: [
				// p5 opens Q02 — most of the 507 tokens are the printed Q02
				// prompt. Student writes a single handwritten line ("If Jim
				// becomes a franchisor…"). Require just SOME attribution.
				{ page: 5, minTokens: 15 },
				// p6 is a PURE continuation page — the entire page is student
				// handwriting, no visible question label, no printed template.
				// OCR pulled ~187 tokens; essentially all of them should be Q02.
				// This is the failure case currently producing 0/187 in prod.
				{ page: 6, minCoverage: 0.9, minTokens: 150 },
				// p7 closes the answer with "…END OF QUESTIONS" and a "7|Page"
				// footer. Small printed tail so coverage is high but not 1.0.
				{ page: 7, minCoverage: 0.85, minTokens: 75 },
			],
		},
		// Page 1 is just "BROWN Aaron Anna" over an AQA cover template — no
		// answers anywhere. Today 4 tokens get mis-attributed to Q1.
		nonAnswerPages: [1],
		// Q9 ("What is the formula for profit?") — whatever Aaron wrote will
		// contain "=" if he wrote a formula. This is the canary for the
		// "Cloud Vision drops standalone punctuation" regression that
		// motivated moving answer_text into the attribution LLM output.
		answerTextMustContain: [{ questionNumber: "9", substrings: ["="] }],
	},
}
