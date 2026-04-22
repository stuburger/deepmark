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
}
