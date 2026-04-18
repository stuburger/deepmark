import * as path from "node:path"
import type { FixtureSpec } from "../shared-types"

/**
 * Kai Jassi — 3-page AQA Business submission from the stuartbourhill dev
 * environment (exam paper `cmnx7q3p80000uow3uhw0lpsf`, submission
 * `cmo09672v00005nw315h5grbf`).
 *
 * Primary eval target: 02.5 (9-mark recommendation) spans pages 2 and 3.
 *
 * Page 2 is a *dense* multi-answer page — 02.2, 02.3, 02.4, AND 02.5 all live
 * on it. This is exactly the case where the old answer-regions approach had
 * regions bleed into each other. Eval 4 asserts each of those four answers
 * receives a non-trivial slice of tokens (no collapse into a single region).
 *
 * Page 1 mixes MCQ (1.1–1.4) with short written answers (01.5, 01.6, 01.7,
 * 02.1). Tests that MCQ regions don't gobble surrounding short-answer tokens.
 */

const PREFIX = "test-kai-jassi"

export const KAI_JASSI_FIXTURE: FixtureSpec = {
	name: "kai-jassi",
	userId: `${PREFIX}-user`,
	examPaperId: `${PREFIX}-exam`,
	sectionId: `${PREFIX}-section`,
	dir: path.resolve(__dirname),
	questions: [
		{
			id: `${PREFIX}-q1.1`,
			question_number: "1.1",
			question_type: "multiple_choice",
			text: "Which of the following is most likely to be produced using flow production?",
			points: 1,
			multiple_choice_options: [
				{ option_label: "A", option_text: "Wedding cakes" },
				{ option_label: "B", option_text: "Custom furniture" },
				{ option_label: "C", option_text: "Tinned food" },
				{ option_label: "D", option_text: "Designer dresses" },
			],
		},
		{
			id: `${PREFIX}-q1.2`,
			question_number: "1.2",
			question_type: "multiple_choice",
			text: "Which of the following describes the process of managing the providers of resources at the best possible price?",
			points: 1,
			multiple_choice_options: [
				{ option_label: "A", option_text: "Logistics" },
				{ option_label: "B", option_text: "Procurement" },
				{ option_label: "C", option_text: "Marketing" },
				{ option_label: "D", option_text: "Finance" },
			],
		},
		{
			id: `${PREFIX}-q1.3`,
			question_number: "1.3",
			question_type: "multiple_choice",
			text: "Which of the following is a cost of maintaining quality?",
			points: 1,
			multiple_choice_options: [
				{ option_label: "A", option_text: "Loss of customers" },
				{ option_label: "B", option_text: "Higher rework costs" },
				{ option_label: "C", option_text: "Training staff" },
				{ option_label: "D", option_text: "Product recalls" },
			],
		},
		{
			id: `${PREFIX}-q1.4`,
			question_number: "1.4",
			question_type: "multiple_choice",
			text: "Which of the following describes the process of choosing suppliers and negotiating the overall deal?",
			points: 1,
			multiple_choice_options: [
				{ option_label: "A", option_text: "Sourcing" },
				{ option_label: "B", option_text: "Distribution" },
				{ option_label: "C", option_text: "Logistics" },
				{ option_label: "D", option_text: "Branding" },
			],
		},
		{
			id: `${PREFIX}-q01.5`,
			question_number: "01.5",
			question_type: "written",
			text: "Identify two ways a business can identify quality problems.",
			points: 2,
			multiple_choice_options: [],
		},
		{
			id: `${PREFIX}-q01.6`,
			question_number: "01.6",
			question_type: "written",
			text: "Explain one advantage of job production.",
			points: 2,
			multiple_choice_options: [],
		},
		{
			id: `${PREFIX}-q01.7`,
			question_number: "01.7",
			question_type: "written",
			text: "State and explain two methods of post sales service.",
			points: 4,
			multiple_choice_options: [],
		},
		{
			id: `${PREFIX}-q02.1`,
			question_number: "02.1",
			question_type: "written",
			text: "Using Item A, calculate the average number of tea bags a tea drinker in the UK uses each day.",
			points: 2,
			multiple_choice_options: [],
		},
		{
			id: `${PREFIX}-q02.2`,
			question_number: "02.2",
			question_type: "written",
			text: "Explain one customer expectation of quality when buying products from Yorkshire Tea.",
			points: 4,
			multiple_choice_options: [],
		},
		{
			id: `${PREFIX}-q02.3`,
			question_number: "02.3",
			question_type: "written",
			text: "Analyse one benefit to Yorkshire Tea of effective logistics throughout the tea production process.",
			points: 6,
			multiple_choice_options: [],
		},
		{
			id: `${PREFIX}-q02.4`,
			question_number: "02.4",
			question_type: "written",
			text: "Define the term customer engagement.",
			points: 2,
			multiple_choice_options: [],
		},
		{
			id: `${PREFIX}-q02.5`,
			question_number: "02.5",
			question_type: "written",
			text: "Recommend whether Taylors should increase the amount of customer engagement activities for Yorkshire Tea. Justify your answer using evidence from the case study.",
			points: 9,
			multiple_choice_options: [],
		},
	],
	pages: [
		{ order: 1, mime_type: "image/jpeg", image_filename: "page1.jpg" },
		{ order: 2, mime_type: "image/jpeg", image_filename: "page2.jpg" },
		{ order: 3, mime_type: "image/jpeg", image_filename: "page3.jpg" },
	],
	expectations: {
		// 02.5 (9-mark recommendation) starts at the bottom of p2 and runs to
		// the end of p3. Current production attribution is considered the
		// ground-truth ceiling — thresholds sit below those counts with margin.
		continuation: {
			questionNumber: "02.5",
			pages: [
				// p2 shares with 02.2, 02.3, 02.4 — 02.5 is the last chunk.
				// Currently attributed: 63 tokens. Threshold 40 leaves headroom.
				{ page: 2, minTokens: 40 },
				// p3 is pure 02.5 continuation (plus a small footer). Currently
				// 73/76 = 96%. Threshold minCoverage=0.9 + minTokens=60.
				{ page: 3, minCoverage: 0.9, minTokens: 60 },
			],
		},
		// Page 2 has 4 distinct short-to-medium answers stacked. This is
		// exactly where the old answer-regions approach had regions bleed
		// into each other. Current counts: 02.2=40, 02.3=81, 02.4=20, 02.5=63.
		// Threshold 10 catches collapse (single-answer-gobbles-all) without
		// overfitting the exact counts.
		densePages: [
			{
				page: 2,
				mustHaveNonTrivial: ["02.2", "02.3", "02.4", "02.5"],
				minTokensPerAnswer: 10,
			},
		],
	},
}
