// Snapshot of a real DeepMark submission — Y10 Media, "Eshan A", 55/83 marks.
// Submission id: 33e76752-1099-44fc-8f0c-42a77bf5c0c7
// Pages 2, 7 and 11 lifted verbatim from student_paper_annotations.
import type { Fixture } from "./types";

export const fixture: Fixture = {
	studentName: "Eshan A",
	paperTitle: "Y10 Media · Mock paper",
	totalAwarded: 55,
	totalMax: 83,
	scenes: [
		{
			pageImage: "/pages/page-02.jpg",
			questionNumber: "2",
			questionText:
				"What are the connotations of the front cover of Tatler magazine and what meaning does this create for the audience?",
			maxMarks: 12,
			awarded: 8,
			feedbackSummary:
				"Level 3 · Good analysis of media language and its meanings for the audience.",
			annotations: [
				{
					signal: "underline",
					sentiment: "positive",
					bbox: [416, 142, 483, 789],
					reason: "Identifies visual elements and their connotation.",
					comment: "Identifies femininity through visual elements.",
					aoDisplay: "Analyse media language",
					aoQuality: "valid",
				},
				{
					signal: "underline",
					sentiment: "positive",
					bbox: [455, 147, 518, 749],
					reason: "Links connotation to audience appeal.",
					aoDisplay: "Analyse media language",
					aoQuality: "valid",
				},
				{
					signal: "underline",
					sentiment: "positive",
					bbox: [624, 322, 651, 657],
					reason: "Connotation of white dress identified.",
					aoDisplay: "Analyse media language",
					aoQuality: "valid",
				},
				{
					signal: "underline",
					sentiment: "positive",
					bbox: [657, 153, 714, 781],
					reason: "Meaning created for Emma Weymouth.",
					aoDisplay: "Analyse media language",
					aoQuality: "valid",
				},
				{
					signal: "double_underline",
					sentiment: "positive",
					bbox: [757, 148, 855, 789],
					reason: "Analysis of ring symbolism — prosperity and glamour.",
					aoDisplay: "Analyse media language",
					aoQuality: "strong",
				},
			],
		},
		{
			pageImage: "/pages/page-07.jpg",
			questionNumber: "7",
			questionText:
				"Explain how advertisements reflect the historical context in which they were created. Refer to the OMO advertisement.",
			maxMarks: 12,
			awarded: 7,
			feedbackSummary:
				"Level 3 · Good explanation of gender stereotypes, but includes a factual inaccuracy.",
			annotations: [
				{
					signal: "tick",
					sentiment: "positive",
					bbox: [389, 137, 546, 826],
					reason: "Correctly identifies technological context.",
					aoDisplay: "Contextual understanding",
					aoQuality: "strong",
				},
				{
					signal: "circle",
					sentiment: "negative",
					bbox: [287, 409, 323, 832],
					reason: "Misinterpretation of colour symbolism.",
					comment: "Doesn't reflect the UK context.",
					aoDisplay: "Contextual understanding",
					aoQuality: "incorrect",
				},
				{
					signal: "cross",
					sentiment: "negative",
					bbox: [356, 369, 379, 570],
					reason: "Factual inaccuracy — incorrect country of origin.",
					comment: "OMO is a British brand.",
					aoDisplay: "Contextual knowledge",
					aoQuality: "incorrect",
				},
				{
					signal: "underline",
					sentiment: "positive",
					bbox: [627, 459, 654, 634],
					reason: "Identifies key contextual theme.",
				},
			],
		},
		{
			pageImage: "/pages/page-11.jpg",
			questionNumber: "13",
			questionText:
				"'Gender representation in video games is fair and balanced.' How far do you agree? Refer to Black Pink: The Game and Lara Croft Go.",
			maxMarks: 20,
			awarded: 15,
			feedbackSummary:
				"Level 4 · Good discussion using relevant examples and theory.",
			annotations: [
				{
					signal: "underline",
					sentiment: "positive",
					bbox: [292, 134, 464, 889],
					reason: "Good contextual knowledge of Lara Croft's evolution.",
				},
				{
					signal: "box",
					sentiment: "positive",
					bbox: [568, 208, 599, 421],
					reason: "Key theoretical framework identified.",
				},
				{
					signal: "double_underline",
					sentiment: "positive",
					bbox: [603, 134, 768, 859],
					reason: "Strong application of Propp's theory to Lara Croft.",
					aoDisplay: "Discussion",
					aoQuality: "strong",
				},
			],
		},
	],
};
