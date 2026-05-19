import { join } from "node:path"
import type { AnnotationFixtureSpec } from "../shared-types"

/**
 * Jaufferdeen A — Pearson English Lang P1, Question 6 (creative writing).
 *
 * Question type: level_of_response (AO5 24m + AO6 16m, 40m total). The
 * student wrote a short narrative about a journey to a 50th birthday;
 * awarded 13/40 (Level 2 on both AOs).
 *
 * Why this fixture: the canonical LoR test case for annotation. AO awards
 * with descriptor_evaluations are the prompt's primary anchor signal — the
 * LLM should produce per-descriptor annotations (positive on met,
 * negative on not-met) with evidence quoted verbatim from the student
 * answer.
 *
 * AO awards are HAND-AUTHORED — they're not persisted to the DB today
 * (they live on the PM `questionAnswer` node). See
 * `docs/build-plan-2026-05-19-grading-payload-db-persistence.md`. Once that
 * lands, this fixture's `gradingResult.ao_awards` should be sourced from
 * `marking_results.ao_awards` instead.
 */
export const JAUFFERDEEN_Q6_FIXTURE: AnnotationFixtureSpec = {
	name: "jaufferdeen-q6",
	dir: join(__dirname),
	examBoard: "Pearson Edexcel",
	subject: "english",
	levelDescriptors: null,
	gradingResult: {
		_v: 1,
		question_id: "cmp8npx49000f5pw3vlfkelgk",
		question_number: "6",
		question_text:
			"Look at the images provided. Write about a time when you, or someone you know, went on an interesting journey. Your response could be real or imagined. You may wish to base your response on one of the images.",
		student_answer:
			"Steadily, the wheels of the my overweight suitcase rolled across the airport lounge as I calculated the timings of my arrival. It was a pandemonium. The robotic voice over the speakers, the stamp being continuously called on boarding passes, the wind being wailed in front of a person, made by ear drums blast.\n\nNo matter what, I had to get there by 8pm maximum.\n\nI clutched the grip of my passport in one hand, and the handle of my about-to-be broken suitcase in the other. As my sandals clacked on the floor, a rush of thick, hot burning air slapped me across the face. My vitamin D increasing by the minute.\n\nOn the right hand side, a sign disclaimed 'ALLA' in big, bold, black letters. It catches my attention, the man holding the sign, gives me a wave, recognising my face, and also politely grabbing the handle from my irritable, sore fingers. Relieved, I let out a sigh.\n\nI hopped into the taxi, desperately checking my watch, as the red hand moved paces as quick as a cheetah. I thought to myself I can't miss his 50th. I contemplated, worried. How am I going to get in the house? Is this even the right address?\n\n'Charger?' I asked the driver, panicked as the battery on my phone was under 10%. Politely, he plugs in the charger and hands it to me, while I smile, thinking that at least one thing went right.\n\nSlowly, I lower the windows.",
		awarded_score: 13,
		max_score: 40,
		llm_reasoning:
			"The student's response was evaluated against AO5 and AO6. For AO5, the student demonstrated some ability to communicate imaginatively and showed awareness of audience and purpose, using paragraphs and a range of sentence structures, leading to a Level 2 award. However, inconsistencies in clarity, awkward phrasing, and an abrupt ending prevented it from reaching Level 3. For AO6, the student used a range of vocabulary and sentence structures with some control over punctuation, also leading to a Level 2 award. However, grammatical errors, imprecise word choices, and inconsistent punctuation accuracy prevented it from reaching Level 3. The total score is the sum of marks from AO5 and AO6.",
		feedback_summary:
			"Awarded 13/40 marks. The narrative shows some imagination, but clarity and development need improvement.",
		marking_method: "level_of_response",
		level_awarded: 2,
		why_not_next_level:
			"The response does not demonstrate a clear ability to communicate effectively due to awkward phrasing and lacks development of information and ideas.",
		cap_applied: "",
		mark_points_results: [],
		ao_awards: [
			{
				ao_code: "AO5",
				level_awarded: 2,
				awarded_marks: 8,
				max_marks: 24,
				descriptor_evaluations: [
					{
						descriptor:
							"Some ability to communicate clearly, effectively and imaginatively.",
						met: true,
						evidence:
							"Steadily, the wheels of the my overweight suitcase rolled across the airport lounge as I calculated the timings of my arrival.",
					},
					{
						descriptor:
							"Shows an awareness of audience and purpose, with straightforward use of tone, style and register.",
						met: true,
						evidence:
							"It was a pandemonium. The robotic voice over the speakers, the stamp being continuously called on boarding passes, the wind being wailed in front of a person",
					},
					{
						descriptor:
							"Expresses and orders information and ideas; uses paragraphs and a range of structural and grammatical features.",
						met: true,
						evidence:
							"No matter what, I had to get there by 8pm maximum.",
					},
					{
						descriptor:
							"Clear ability to communicate clearly, effectively and imaginatively.",
						met: false,
						evidence:
							"Awkward phrasing such as 'made by ear drums blast' and the abrupt fragment 'My vitamin D increasing by the minute.' breaks the clarity of imagery.",
					},
					{
						descriptor:
							"Selects material and stylistic or rhetorical devices to suit audience and purpose, with appropriate use of tone, style and register.",
						met: false,
						evidence:
							"Tense shifts mid-narrative — 'It catches my attention, the man holding the sign, gives me a wave' — undermine consistent voice.",
					},
					{
						descriptor:
							"Develops and connects appropriate information and ideas; structural and grammatical features and paragraphing make meaning clear.",
						met: false,
						evidence:
							"Closing sentence 'Slowly, I lower the windows.' is abrupt; the build-up about the 50th and the address question is never resolved.",
					},
				],
				why_not_next_level:
					"Awkward phrasing and an abrupt ending prevent the response from reaching the 'clear' communication required at Level 3.",
			},
			{
				ao_code: "AO6",
				level_awarded: 2,
				awarded_marks: 5,
				max_marks: 16,
				descriptor_evaluations: [
					{
						descriptor: "Some ability to write for clarity, purpose and effect.",
						met: true,
						evidence:
							"I clutched the grip of my passport in one hand, and the handle of my about-to-be broken suitcase in the other.",
					},
					{
						descriptor:
							"Writes with a range of correctly spelt vocabulary, e.g. words with regular patterns such as prefixes, suffixes, double consonants.",
						met: true,
						evidence:
							"pandemonium, continuously, irritable, recognising — all spelt correctly with handled affixes.",
					},
					{
						descriptor:
							"Uses punctuation with control, creating a range of sentence structures, including coordination and subordination.",
						met: true,
						evidence:
							"As my sandals clacked on the floor, a rush of thick, hot burning air slapped me across the face.",
					},
					{
						descriptor: "Sound ability to write for clarity, purpose and effect.",
						met: false,
						evidence:
							"Ungrammatical phrasing 'made by ear drums blast' and fragmentary 'My vitamin D increasing by the minute.' break clarity.",
					},
					{
						descriptor:
							"Uses a varied vocabulary and spells words containing irregular patterns correctly.",
						met: false,
						evidence:
							"Imprecise word choice in metaphors: 'My vitamin D increasing by the minute' for warmth reads awkwardly.",
					},
					{
						descriptor:
							"Uses accurate and varied punctuation, adapting sentence structure to contribute positively to purpose and effect.",
						met: false,
						evidence:
							"Tense inconsistency 'catches… gives me a wave… grabbing… let out a sigh' mixes present and past within one paragraph.",
					},
				],
				why_not_next_level:
					"Grammatical fragments, imprecise word choices, and inconsistent tense use prevent the response reaching the 'sound' clarity required at Level 3.",
			},
		],
		what_went_well: [
			"Strong opening imagery with the suitcase rolling across the airport lounge",
			"Effective sensory list when describing the pandemonium",
			"Confident vocabulary range (pandemonium, irritable, continuously)",
		],
		even_better_if: [
			"Develop and resolve the narrative threads (the 50th, the address)",
			"Maintain consistent tense throughout — pick past OR present",
			"Replace awkward fragments like 'My vitamin D increasing by the minute.' with full clauses",
		],
		mark_scheme_id: "cmp8npx4u000g5pw3swq5pw1r",
	},
	markScheme: {
		description: "AO5 (24 marks), AO6 (16 marks)",
		guidance: null,
		marking_method: "level_of_response",
		mark_points: [],
		content: `## Indicative content

Purpose: to write a real or imagined piece about a time when the candidate, or someone they know, went on an interesting journey. This may involve a range of approaches, including: description, anecdote, speech, narrative and literary techniques. Audience: the writing is for a general readership. Form: the response may be narrative, descriptive or a monologue. There should be clear organisation and structure with an introduction, development of points and a conclusion.

## Assessment dimensions

### AO5 — Communicate clearly, effectively and imaginatively (24 marks)

**Level 2 (5–9 marks)**
- Some ability to communicate clearly, effectively and imaginatively.
- Shows an awareness of audience and purpose, with straightforward use of tone, style and register.
- Expresses and orders information and ideas; uses paragraphs and a range of structural and grammatical features.

**Level 3 (10–14 marks)**
- Clear ability to communicate clearly, effectively and imaginatively.
- Selects material and stylistic or rhetorical devices to suit audience and purpose, with appropriate use of tone, style and register.
- Develops and connects appropriate information and ideas; structural and grammatical features and paragraphing make meaning clear.

### AO6 — Vocabulary, sentence structures, spelling and punctuation (16 marks)

**Level 2 (5–7 marks)**
- Some ability to write for clarity, purpose and effect.
- Writes with a range of correctly spelt vocabulary.
- Uses punctuation with control, creating a range of sentence structures, including coordination and subordination.

**Level 3 (8–10 marks)**
- Sound ability to write for clarity, purpose and effect.
- Uses a varied vocabulary and spells words containing irregular patterns correctly.
- Uses accurate and varied punctuation, adapting sentence structure to contribute positively to purpose and effect.

## Marker notes

Your response will be marked for the accurate and appropriate use of vocabulary, spelling, punctuation and grammar.`,
	},
	expectations: {
		// LoR with two AOs at Level 2 — the prompt should anchor at least one
		// positive annotation per AO (descriptors met) and at least one
		// negative annotation per AO (descriptors not met at the next level).
		// Generous upper bound while we capture baseline; tighten after a few runs.
		annotationCount: { min: 4, max: 20 },
		mustHaveAoCodes: ["AO5", "AO6"],
		// Expect at least one positive (tick / underline) and at least one
		// critical (cross / box) — LoR with mixed met/not-met descriptors.
		mustHaveSignals: ["tick", "cross"],
	},
}
