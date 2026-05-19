import { join } from "node:path"
import type { AnnotationFixtureSpec } from "../shared-types"

/**
 * Jaufferdeen A — Pearson English Lang P1, Question 2.
 *
 * Question type: point_based (2 marks, 7 possible mark points). The student
 * answered correctly and was awarded 2/2 — both their points anchored on
 * verbatim quotes ("most lovingly", "wept") that match canonical mark points.
 *
 * Why this fixture: shortest real point_based answer we have. Lets the eval
 * scaffolding run in seconds against the actual LLM without burning budget.
 * Mark scheme has 7 quotable points but only 2 needed to score — annotation
 * LLM should produce ~2 ticks (one per awarded point) plus optionally an
 * underline on the quoted evidence.
 */
export const JAUFFERDEEN_Q2_FIXTURE: AnnotationFixtureSpec = {
	name: "jaufferdeen-q2",
	dir: join(__dirname),
	examBoard: "Pearson Edexcel",
	subject: "english",
	levelDescriptors: null,
	gradingResult: {
		_v: 1,
		question_id: "cmp8npwz900075pw30kze6uz9",
		question_number: "2",
		question_text:
			"From the extract, give two ways in which the narrator shows how much she loves Bobby. You may use your own words or quotations from the text.",
		student_answer:
			"1 'most lovingly, with many tears' - she feels so emotional about him leaving\n2 'then I wept' - one wont stop crying / tearing up.",
		awarded_score: 2,
		max_score: 2,
		llm_reasoning:
			'The student clearly identified two distinct ways the narrator shows love for Bobby. The first point quotes "most lovingly" which directly matches mark point 4. The second point quotes "then I wept" and explains it as "one won\'t stop crying", which directly matches mark point 7 and also implies mark point 6 (inconsolable). Both points are well-supported by textual evidence and explanation. The maximum score is 2 marks, and the student has earned both.',
		feedback_summary:
			"Awarded 2/2 marks. The student successfully identified two distinct ways the narrator shows love for Bobby using clear textual evidence.",
		marking_method: "point_based",
		mark_points_results: [
			{
				pointNumber: 4,
				awarded: true,
				reasoning:
					'Student quotes "most lovingly" directly from the text, showing the narrator\'s deep affection.',
				studentCovered: "'most lovingly, with many tears'",
				expectedCriteria: "'most lovingly'",
			},
			{
				pointNumber: 7,
				awarded: true,
				reasoning:
					'Student quotes "then I wept" and explains it as "one wont stop crying", showing inconsolable grief.',
				studentCovered: "'then I wept' - one wont stop crying / tearing up.",
				expectedCriteria: "'wept'",
			},
		],
		mark_scheme_id: "cmp8npwzs00085pw3qjk1fkgn",
	},
	markScheme: {
		description: "AO1 (2 marks)",
		guidance: null,
		marking_method: "point_based",
		content: "",
		mark_points: [
			{
				pointNumber: 1,
				points: 1,
				description: "",
				criteria:
					"she sums up the totality of their love as belonging to one another",
			},
			{
				pointNumber: 2,
				points: 1,
				description: "",
				criteria: "they reciprocate their love for each other",
			},
			{
				pointNumber: 3,
				points: 1,
				description: "",
				criteria: "'I kissed him' / 'I kissed him back'",
			},
			{
				pointNumber: 4,
				points: 1,
				description: "",
				criteria: "'most lovingly'",
			},
			{
				pointNumber: 5,
				points: 1,
				description: "",
				criteria: "when they kiss, she cries tears of happiness",
			},
			{
				pointNumber: 6,
				points: 1,
				description: "",
				criteria: "when Bobby has to leave, she is inconsolable.",
			},
			{
				pointNumber: 7,
				points: 1,
				description: "",
				criteria: "'wept'",
			},
		],
	},
	expectations: {
		annotationCount: { min: 1, max: 6 },
		// AO1 may or may not be tagged for point_based; the prompt allows it
		// but doesn't require it. Leaving `mustHaveAoCodes` unset.
		mustHaveSignals: ["tick"],
	},
}
