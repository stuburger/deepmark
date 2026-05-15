import type {
	AoAllocation,
	LearningContentItem,
	QuestionWithMarkScheme,
} from "../types"
import { renderStimuliBlock } from "./stimuli"

/**
 * Builds the prompt for grading a single Level-of-Response question.
 *
 * Discipline: holistic vibe-grading is forbidden. The marker iterates the
 * question's ao_allocations (one dimension for single-skill, multiple for
 * parallel-grid multi-skill), and for each dimension produces:
 *   1. discrete `descriptor_evaluations` at the awarded Level AND next Level
 *   2. a Level award that follows from those discrete decisions
 *   3. a mark within the band reflecting evidence strength
 *
 * Same prompt shape regardless of dimensionality. The total score = sum of
 * per-dimension awarded marks. Pure function — no class deps, no side effects.
 */
export function buildLoRPrompt(
	question: QuestionWithMarkScheme,
	answer: string,
	questionNumber?: number,
	totalQuestions?: number,
	learningContent?: LearningContentItem[],
	levelDescriptors?: string,
): string {
	if (!question.content?.trim()) {
		throw new Error(
			`LevelOfResponse marking requires content for question ${question.id}`,
		)
	}

	const dimensions = resolveDimensions(question)

	const learningSection =
		learningContent && learningContent.length > 0
			? `<LearningMaterial>\n${learningContent.map((lc) => `## ${lc.title}\n${lc.content}`).join("\n\n---\n\n")}\n</LearningMaterial>\n\n`
			: ""

	const parsingNote =
		questionNumber && totalQuestions && totalQuestions > 1
			? `\n<ParsingInstructions>This is question ${questionNumber} of ${totalQuestions}. Extract the answer for THIS question from the student's response before marking.</ParsingInstructions>\n`
			: ""

	const stimulusSection = renderStimuliBlock(question.stimuli)

	const dimensionsBlock = renderDimensionsBlock(
		dimensions,
		question.totalPoints,
	)

	return `Mark this answer using Level of Response. Holistic vibe-grading is forbidden. Every Level award must be the OUTPUT of discrete descriptor evaluations — one decision per descriptor bullet at the awarded Level AND the next Level. Quote student text verbatim as evidence; never invent application not present in the response.

${learningSection}${stimulusSection}<Topic>\n${question.topic}\n</Topic>

<Question>\nQuestion ID: ${question.id}\n\n${question.questionText}\n</Question>

<MarkScheme>\n${question.rubric}${question.guidance ? `\nGuidance: ${question.guidance}` : ""}\n\nTotal marks available: ${question.totalPoints}.
</MarkScheme>

<MarkSchemeContent>
${question.content}
</MarkSchemeContent>

${dimensionsBlock}${levelDescriptors ? `\n\n<TeacherMarkingGuidance>\nTeacher-authored marking guidance for this exam. May include level descriptors, feedback style instructions, and/or few-shot examples.\nUse alongside the question-specific mark scheme to inform your marking and feedback style.\n${levelDescriptors}\n</TeacherMarkingGuidance>` : ""}

<StudentAnswer>\n${answer || "[No answer provided]"}\n</StudentAnswer>${parsingNote}

<MarkingProcess>
For EACH dimension listed in <Dimensions> above, in order:

1. Skim every Level's descriptors against the response to identify the candidate Level — the highest Level whose descriptors are demonstrably met.

2. Evaluate EVERY descriptor bullet at the candidate Level AND the candidate Level + 1 (the "next Level"). For each bullet emit one descriptor_evaluations entry:
   - descriptor: copy the bullet text verbatim from the mark scheme — do not paraphrase
   - met: true ONLY if the response clearly demonstrates the descriptor; false otherwise. No "partially". When in doubt, NOT met.
   - evidence:
       • when met: a short verbatim quote from the student response (8+ words) that demonstrates this descriptor
       • when not met: a short description of what's missing (e.g. "no chain of reasoning past the first consequence", "no specific operational detail")
       • never empty

3. Confirm the Level award:
   - awarded Level descriptors should be mostly met (≥ half)
   - next-Level descriptors should be mostly NOT met
   - if you find that next-Level descriptors are mostly met, raise the candidate to the next Level and repeat step 2 with the new candidate + new next Level
   - if awarded Level descriptors are NOT mostly met, drop the candidate to the lower Level and repeat

4. Pick the mark within the awarded Level's band:
   - bottom of band when few descriptors are met or evidence is thin
   - middle when most are met with reasonable evidence
   - top when all are met with strong evidence
   - a SINGLE strong piece of evidence does not promote to the next Level if other descriptors are unmet

5. whyNotNextLevel: one sentence citing the specific NOT-MET descriptor(s) that prevented the next Level. Empty if at top Level.
</MarkingProcess>

<TrapAvoidance>
Polished prose, confident tone, and length are NOT evidence. A long answer with generic AO2 ("customers like good service", "looks professional", repeated reasoning) does NOT reach the top Level no matter how clean it reads. Read for chain depth and business-specific application — not for surface polish.

If the question's command word is Analyse, do NOT require evaluation/judgement to reach the top Level.
If the command word is Justify or Evaluate, a top-Level answer MUST include a conditional 'it depends' judgement explicitly tied to the analysis — not a generic "I think it's a good idea".
</TrapAvoidance>

<AggregationRules>
- aoAwards: one entry per dimension listed in <Dimensions> above, in order. Each award's maxMarks must match the dimension's printed marks.
- totalScore: MUST equal the sum of aoAwards[*].awardedMarks. If the sum doesn't match, you have an arithmetic error — fix it before returning.
- levelAwarded: mirror aoAwards[0].levelAwarded. (For single-skill marking — currently the common case — this is the only Level. For multi-skill the canonical data is in aoAwards.)
- whyNotNextLevel (top-level): mirror aoAwards[0].whyNotNextLevel.
- capApplied: if a cap explicitly applies from the marker_notes (e.g. polish-without-depth → capped at L2), describe it; otherwise empty.
- whatWentWell: derive from MET descriptors (1-3 bullets, ≤ 8 words, reference the business context).
- whatDidntGoWell: derive from NOT-MET next-Level descriptors, phrased as actionable tips ("Try...", "Next time..."). 1-3 bullets, ≤ 8 words. Never restate the failure — only what to do better.
- markPointsResults: empty array (this is LoR, not point-based).
- correctAnswer, relevantLearningSnippet: empty strings.
</AggregationRules>`
}

function resolveDimensions(question: QuestionWithMarkScheme): AoAllocation[] {
	if (question.aoAllocations && question.aoAllocations.length > 0) {
		return question.aoAllocations
	}
	// Single virtual dimension for single-skill marking with no printed AO
	// breakdown. The marker treats this identically to a single-AO question;
	// the only difference is the synthetic "Overall" label.
	return [{ aoCode: "Overall", marks: question.totalPoints }]
}

function renderDimensionsBlock(
	dimensions: AoAllocation[],
	totalPoints: number,
): string {
	const rows = dimensions
		.map((d) => `  - ${d.aoCode}: ${d.marks} marks`)
		.join("\n")
	return `<Dimensions>
Iterate these assessment dimensions in order, producing one aoAwards entry per dimension. Dimension marks sum to the question total (${totalPoints}).
${rows}
</Dimensions>`
}
