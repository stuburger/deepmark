import * as path from "node:path"
import type { QuestionPaperSectionsFixture } from "../shared-types"

/**
 * AQA-style GCSE Business mock, Year 9 (March 2026).
 * Sourced from production ingestion job cmo955ugt000102l17h51y65b.
 *
 * The cover page explicitly advertises two sections:
 *   Mark for Section A / 25
 *   Mark for Section B / 18
 *   Total Mark      / 43
 *
 * Section A (25 marks) — 13 questions:
 *   01.1, 01.2, 01.3 — MCQs, 1 mark each
 *   01.4             — written, 2 marks
 *   2                — written, 2 marks (organic growth)
 *   3                — written, 4 marks (factors of production)
 *   4–10             — written, 2 marks each
 *
 * Section B (18 marks) — 2 questions:
 *   1   — written, 6 marks  (Tesco location — stimulus Item A)
 *   02. — written, 12 marks (franchising — stimulus Item B)
 */
export const GCSE_BUSINESS_YR9_GWA_2_FIXTURE: QuestionPaperSectionsFixture = {
	name: "gcse-business-yr9-gwa-2",
	dir: path.resolve(__dirname),
	pdf_filename: "document.pdf",
	total_marks: 43,
	paperTotalPrintedOnCover: true,
	sections: [
		{
			title: "Section A",
			total_marks: 25,
			question_count: 13,
			question_numbers: [
				"01.1",
				"01.2",
				"01.3",
				"01.4",
				"2",
				"3",
				"4",
				"5",
				"6",
				"7",
				"8",
				"9",
				"10",
			],
		},
		{
			title: "Section B",
			total_marks: 18,
			question_count: 2,
			question_numbers: ["1", "02."],
		},
	],
	marksExpectations: [
		// Section A — MCQs print "(1 mark)" beside each question
		{ questionNumber: "01.1", marks: 1, printedInParens: true },
		{ questionNumber: "01.2", marks: 1, printedInParens: true },
		{ questionNumber: "01.3", marks: 1, printedInParens: true },
		// 01.4 prints "(2 marks)" inline with the prompt
		{ questionNumber: "01.4", marks: 2, printedInParens: true },
		// 2 — "Explain organic growth (2 marks)" — the canary for the bug we are
		// fixing. Historically the LLM bled 12 marks from the franchising 02.
		// onto this row; the validator + parenthetical now make that detectable.
		{ questionNumber: "2", marks: 2, printedInParens: true },
		{ questionNumber: "3", marks: 4, printedInParens: true },
		{ questionNumber: "4", marks: 2, printedInParens: true },
		{ questionNumber: "5", marks: 2, printedInParens: true },
		{ questionNumber: "6", marks: 2, printedInParens: true },
		{ questionNumber: "7", marks: 2, printedInParens: true },
		{ questionNumber: "8", marks: 2, printedInParens: true },
		{ questionNumber: "9", marks: 2, printedInParens: true },
		{ questionNumber: "10", marks: 2, printedInParens: true },
		// Section B — both questions print marks in parens
		{ questionNumber: "Q1.", marks: 6, printedInParens: true },
		{ questionNumber: "02.", marks: 12, printedInParens: true },
	],
	stimulusExpectations: [
		{
			// MCQs must never attract stimuli.
			questionNumber: "01.1",
			labels: [],
		},
		{
			questionNumber: "01.2",
			labels: [],
		},
		{
			questionNumber: "01.3",
			labels: [],
		},
		{
			// Section A standalone written question — no stimulus.
			questionNumber: "2",
			labels: [],
		},
		{
			// Section B Q1 references Item A (Tesco case study).
			// Paper prints "Q1." — LLM preserves that form per prompt instruction.
			questionNumber: "Q1.",
			labels: ["Item A"],
			// Distinctive phrases from Item A's case study text.
			contentMustContain: ["Tesco", "private sector employer", "Tesco Express"],
			questionTextMustContain: ["Analyse", "Tesco"], // the *question* refers to Tesco by name
			questionTextMustNotContain: [
				"Item A",
				"private sector employer",
				"Tesco Extras",
				"80%",
			], // case-study prose must NOT leak into the question body
		},
		{
			// Section B Q02 references Item B (Quality Wallpaper Ltd case study).
			questionNumber: "02.",
			labels: ["Item B"],
			contentMustContain: [
				"Quality Wallpaper",
				"Jim Walls",
				"franchis", // covers "franchising" / "franchisor" / "franchisees"
			],
			questionTextMustContain: ["Analyse", "franchis"],
			questionTextMustNotContain: [
				"Jim Walls",
				"Quality Wallpaper Ltd ten years ago",
				"redundancy money",
				"rising employment levels",
			],
		},
	],
}
