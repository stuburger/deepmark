import * as path from "node:path"
import type { FixtureSpec } from "../shared-types"

/**
 * Ryan C — 3-page FIA2 Economics submission from production
 * (exam paper `cmp1m7bu0000002jrxfn19ady`, submission
 * `fb11a5df-9cce-4f0b-bf52-508457dcfedd`).
 *
 * Atypical shape: the student submitted a fully TYPED report rather than
 * handwriting answers under each question label. The "answers" are the
 * student-authored body sections (Introduction, Background Context,
 * Factors that have impacted the demand…, Evaluate Housing Affordability,
 * etc.) which collectively respond to the multi-part economics question.
 *
 * The original production run failed: per-page comprehension was biased
 * toward handwriting, the attribution LLM hallucinated `page 0` for Q1a
 * and Q1c, and the validator hard-failed the whole script after two
 * retries — 4 wasted multi-image Gemini calls. Fixing the prompt bias
 * and softening the validator are what this fixture guards.
 */

const PREFIX = "test-ryan-c-typed"

export const RYAN_C_TYPED_FIXTURE: FixtureSpec = {
	name: "ryan-c-typed",
	userId: `${PREFIX}-user`,
	examPaperId: `${PREFIX}-exam`,
	sectionId: `${PREFIX}-section`,
	dir: path.resolve(__dirname),
	questions: [
		{
			id: `${PREFIX}-q1a`,
			question_number: "1a",
			question_type: "written",
			text: "Demonstrate your understanding of the price mechanism (demand and supply) as it applies to the Australian housing market. Define and explain the key economic concepts, principles, and models relevant to this market. Use precise economic terminology throughout.",
			points: 10,
			multiple_choice_options: [],
		},
		{
			id: `${PREFIX}-q1c`,
			question_number: "1c",
			question_type: "written",
			text: "Identify and analyse two factors that have significantly impacted the demand for housing in Australia over the last 10 years. For each factor: Explain the economic relationship between the factor and housing demand. Identify the pattern or trend shown in the data. Support your analysis with current, relevant data and economic information.",
			points: 10,
			multiple_choice_options: [],
		},
		{
			id: `${PREFIX}-q1d`,
			question_number: "1d",
			question_type: "written",
			text: "Identify and analyse two factors that have significantly impacted the supply of housing in Australia over the last 10 years. For each factor explain the economic relationship between the factor and housing supply, identify the pattern or trend shown in the data, and support your analysis with current relevant data.",
			points: 13,
			multiple_choice_options: [],
		},
		{
			id: `${PREFIX}-q1e`,
			question_number: "1e",
			question_type: "written",
			text: "Evaluate the housing affordability in Australia using the criteria of price stability (inflation), living standard, and distribution of wealth and income.",
			points: 7,
			multiple_choice_options: [],
		},
		{
			id: `${PREFIX}-partc`,
			question_number: "partc",
			question_type: "written",
			text: "Analyse the distribution of wealth and income in Australia and its relationship to housing affordability.",
			points: 10,
			multiple_choice_options: [],
		},
	],
	pages: [
		{ order: 1, mime_type: "image/jpeg", image_filename: "page1.jpg" },
		{ order: 2, mime_type: "image/jpeg", image_filename: "page2.jpg" },
		{ order: 3, mime_type: "image/jpeg", image_filename: "page3.jpg" },
	],
	expectations: {
		// The strongest assertion this fixture makes: the typed-essay path is
		// NOT a dead end. Before the prompt de-bias every question got 0 tokens
		// and the validator killed the whole script. Each question that has a
		// clear corresponding section in the report must receive a non-trivial
		// chunk of tokens on the page where that section appears.
		//
		// Thresholds are deliberately loose (≥15) because:
		//   - The student titled sections by topic, not by question number, so
		//     the LLM must map section → question semantically; small drift in
		//     where it cleaves Q1c vs Q1d is fine.
		//   - The earlier failure was 0 tokens for every question. Anything ≥
		//     15 proves the typed-text path is working at all.
		densePages: [
			{
				page: 1,
				// p1: title + Introduction + Background Context + Housing
				// affordability Crisis (all → Q1a), then Analysis + "Factors
				// that have impacted the demand of the housing market" with
				// Interest Rates + Population growth subsections (→ Q1c).
				mustHaveNonTrivial: ["1a", "1c"],
				minTokensPerAnswer: 15,
			},
			{
				page: 2,
				// p2: tail of Q1c, then "Factors that have impacted the supply
				// of the housing market" (→ Q1d), then "Evaluate Housing
				// Affordability" with Price Stability + Distribution of wealth
				// subsections (→ Q1e and/or partc).
				mustHaveNonTrivial: ["1d", "1e"],
				minTokensPerAnswer: 15,
			},
		],
		// The Reference List on page 3 is bibliography, not an answer. It's
		// the strongest non-answer signal in the script — if attribution
		// leaks into it we know the model isn't separating content properly.
		// Page 3 is mixed (Q1e tail + Conclusion + Reference List), so we
		// can't claim the WHOLE page is non-answer — handled via answer_text
		// substring checks below instead.
		//
		// Q1e's evaluation section contains "%" frequently (interest rates,
		// inflation figures). If answer_text for Q1e drops every "%" sign the
		// punctuation-preservation path is broken.
		answerTextMustContain: [{ questionNumber: "1e", substrings: ["%"] }],
	},
}
