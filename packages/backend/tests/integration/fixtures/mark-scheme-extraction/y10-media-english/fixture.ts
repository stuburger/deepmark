import * as path from "node:path"

/**
 * Y10 Media Studies mock paper — Geoff's first English-subject upload
 * (2026-05-12). The mark scheme PDF is image-scanned (rasterised pages,
 * not text-extractable), which Gemini reads via its vision path and which
 * is markedly slower than a text PDF.
 *
 * Bug history: this paper hit the 90 s `DEFAULT_LLM_TIMEOUT_MS` on four
 * consecutive upload attempts. The fifth attempt — against a Word→PDF
 * re-export that produced a smaller, text-based document — squeaked
 * through in 87 s. The root cause was the runner default; the envelope
 * fix (handler now derives `timeoutMs` from the Lambda's remaining wall-
 * clock) gives this exact shape of paper its full Lambda envelope
 * (~470 s for an 8-min mark-scheme Lambda) and lets it complete on
 * attempt 1.
 *
 * Sourced from production ingestion job `cmp2lem0u000202js2gttg4jy`.
 *
 * Marking-method split observed in production (from the eventually-
 * successful job `cmp2mtrly000102l85wy4nlts`):
 *   - 1 deterministic (Q1 MCQ)
 *   - 7 point_based  (Q3, Q4, Q8, Q9, Q10×2, Q12)
 *   - 6 level_of_response (Q2, Q5, Q6, Q7, Q11, Q13)
 *
 * The duplicate Q10 is a question-paper extraction quirk (the second Q10
 * is the "synergy" question that should logically be Q11). The mark
 * scheme still successfully matched both rows in production, so we keep
 * the duplicate as-is.
 */

export type ExistingQuestion = {
	id: string
	question_number: string
	question_type: string
	text: string
}

export type Y10MediaEnglishFixture = {
	name: string
	dir: string
	pdf_filename: string
	existingQuestions: ExistingQuestion[]
	expected: {
		totalQuestions: number
		markingMethodCounts: {
			deterministic: number
			point_based: number
			level_of_response: number
		}
	}
}

export const Y10_MEDIA_ENGLISH_FIXTURE: Y10MediaEnglishFixture = {
	name: "y10-media-english",
	dir: path.resolve(__dirname),
	pdf_filename: "document.pdf",
	existingQuestions: [
		{
			id: "cmp2lhxcc000002l3z4enjxxv",
			question_number: "1",
			question_type: "multiple_choice",
			text: "In the photographic image on the cover of Tatler magazine (Figure 1), Emma Weymouth is wearing a pastel pink dress. What does this denote? (tick one box only):",
		},
		{
			id: "cmp2lhxmp000102l330pdpsvt",
			question_number: "2",
			question_type: "written",
			text: "What are the connotations of the front cover of Tatler magazine and what meaning does this create for the audience.",
		},
		{
			id: "cmp2lhxu4000202l3an8hq0tv",
			question_number: "3",
			question_type: "written",
			text: "What is the target demographic and psychographic audience of the Times newspaper. Explain what features identify who the target audience is:",
		},
		{
			id: "cmp2lhy1i000302l3hb3bes4i",
			question_number: "4",
			question_type: "written",
			text: "Identify two differences between the Daily Mirror and The Times newspaper front covers. Give a reason for each (with regard to target audience).",
		},
		{
			id: "cmp2lhy8m000402l387njdt2i",
			question_number: "5",
			question_type: "written",
			text: "Explain why print newspaper sales have been declining.",
		},
		{
			id: "cmp2lhyfq000502l38z841hgk",
			question_number: "6",
			question_type: "written",
			text: "Represent, the NHS Blood and Transplant campaign video, uses a range of representations in order to appeal to a black and minority ethnicity audience. How are the different representations used in order to appeal to this target audience?",
		},
		{
			id: "cmp2lhyni000602l3ytg6oxxb",
			question_number: "7",
			question_type: "written",
			text: "Explain how advertisements reflect the historical context in which they were created. Answer with reference to the OMO advertisement in Figure 2.",
		},
		{
			id: "cmp2lhyuu000702l3o6tw5c54",
			question_number: "8",
			question_type: "written",
			text: 'What record label released the Arctic Monkeys single "I bet that you look good on the dance floor"? What kind of record label is it?',
		},
		{
			id: "cmp2lhz2l000802l3k3uv34mt",
			question_number: "9",
			question_type: "written",
			text: "What record label are Black Pink signed to for their global distribution? which is a subsidiary of?",
		},
		{
			id: "cmp2lhzan000902l39sukb2na",
			question_number: "10",
			question_type: "written",
			text: "Name the other 2 of the 3 major labels which dominate the music industry.",
		},
		{
			id: "cmp2lhzhv000a02l39rzfz8hu",
			question_number: "10",
			question_type: "written",
			text: "Explain briefly what is meant by synergy.",
		},
		{
			id: "cmp2lhzpk000b02l3hsws2ltr",
			question_number: "11",
			question_type: "written",
			text: "Explain how Marcus Rashford has used synergy to raise the profile of his campaign.",
		},
		{
			id: "cmp2lhzxv000c02l3rsafluo5",
			question_number: "12",
			question_type: "written",
			text: "Briefly state the role of PEGI (Pan European Game Information).",
		},
		{
			id: "cmp2li06c000d02l3dzltvec7",
			question_number: "13",
			question_type: "written",
			text: "'Gender representation in video games is fair and balanced.' How far do you agree with this view? Your answer should refer to Black Pink: The Game and Lara Croft Go.",
		},
	],
	expected: {
		totalQuestions: 14,
		markingMethodCounts: {
			deterministic: 1,
			point_based: 7,
			level_of_response: 6,
		},
	},
}
