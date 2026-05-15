import type { PaperBundleFixture } from "../types"

/**
 * Pearson Edexcel GCSE (9–1) English Language — Paper 1: Fiction and Imaginative
 * Writing — Friday 23 May 2025 (paper log P76048A).
 *
 * The first paper-bundle fixture that exercises a SEPARATE stimulus pack
 * (Pearson's "Reading Text Insert" booklet). Section A of this paper carries
 * four questions that all reference the same prose extract ("Poor Pretty
 * Bobby" by Rhoda Broughton, 1873) — the bundle should pull that text out of
 * the insert PDF and attach it as a section-level stimulus, with each Section
 * A question's stimulus_labels referring to it.
 *
 * Files in this fixture:
 *   - question-paper.pdf  — Pearson's clean published QP (P76048A).
 *     NOT YET COMMITTED: Stuart's /english/ folder shipped a student-script
 *     bundle, not a clean QP. The test for this fixture skips until a clean
 *     QP is dropped here.
 *   - mark-scheme.pdf     — clean published MS (1EN0_01_2506_MS).
 *   - stimulus-pack.pdf   — pages 1-4 of /english/English inserts.pdf
 *     (the clean unannotated copy of the May 2025 P76048A insert).
 *
 * The minQuestions floor (5) covers Section A's 4 questions + at least one
 * Section B prompt. Section B typically prints multiple alternative writing
 * tasks; the bundle should still surface at least one. Tighten when the
 * extracted shape stabilises across reruns.
 */

export const EDEXCEL_ENGLISH_LANG_P1_MAY_2025_FIXTURE = {
	name: "Edexcel English Language Paper 1 — May 2025",
	dir: __dirname,
	qpFilename: "question-paper.pdf",
	msFilename: "mark-scheme.pdf",
	stimulusFilename: "stimulus-pack.pdf",
	expected: {
		titleContains: ["english"],
		subject: "english",
		examBoardContains: "Edexcel",
		minSections: 2,
		// Section A (Q1–Q4) + Section B (Q5 + Q6 as either/or alternatives) = 6.
		// Every alternative must still be extracted even though the student only
		// answers one — choice.kind="any_n_of" describes how to total, not
		// whether to extract.
		minQuestions: 6,
		stimulus: {
			minTotal: 1,
			// Content-level anchors that prove the insert PDF was actually
			// consumed (the extract title + the author). Label-naming
			// varies — Pearson uses "Reading Text" / no label at all — so
			// we assert on content, not label.
			contentContains: ["Rhoda Broughton", "Poor Pretty Bobby"],
		},
		sectionChoices: [
			{ titleContains: "section a", kind: "all", n: null },
			// "Answer ONE question" — Q5/Q6 are mutually exclusive options.
			{ titleContains: "section b", kind: "any_n_of", n: 1 },
		],
		// Cover prints 64; with section B treated as a 1-of-2 choice that
		// reconciles to 24 (A) + 40 (B choice) = 64. Catches the regression
		// where bundle naively sums both Section B alternatives → 104.
		expectedPrintedTotal: 64,
		// Section B's Q5 and Q6 are multi-skill LoR: parallel AO5 (24 marks)
		// + AO6 (16 marks) grids that sum to 40 per question. Shared writing
		// assessment grids are printed at the end of the MS, referenced by
		// both questions — extractor must resolve the reference and produce
		// the same lor_extraction shape on each. This is the failure mode
		// the entire marking-accuracy redesign exists to fix.
		lorMultiSkill: [
			{
				questionNumber: "5",
				aoDimensions: [
					{ ao_code: "AO5", marks: 24 },
					{ ao_code: "AO6", marks: 16 },
				],
			},
			{
				questionNumber: "6",
				aoDimensions: [
					{ ao_code: "AO5", marks: 24 },
					{ ao_code: "AO6", marks: 16 },
				],
			},
		],
	},
} as const satisfies PaperBundleFixture
