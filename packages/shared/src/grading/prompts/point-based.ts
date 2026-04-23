import type { LearningContentItem, QuestionWithMarkScheme } from "../types"
import { renderStimuliBlock } from "./stimuli"

/**
 * Builds the prompt for grading a single point-based question.
 * Pure function — no class dependency, no side effects.
 */
export function buildPointBasedPrompt(
	question: QuestionWithMarkScheme,
	answer: string,
	questionNumber?: number,
	totalQuestions?: number,
	learningContent?: LearningContentItem[],
): string {
	// `description` was legacy category metadata; the domain-primary field is
	// `criteria`, which carries what the student must write to earn the mark.
	const markPointsList = question.markPoints
		.map(
			(mp) =>
				`[pointNumber: ${mp.pointNumber}] ${mp.criteria} (${mp.points} mark${mp.points > 1 ? "s" : ""}${mp.isRequired ? ", REQUIRED" : ""})`,
		)
		.join("\n\n")

	const learningSection =
		learningContent && learningContent.length > 0
			? `<LearningMaterial>\n${learningContent.map((lc) => `## ${lc.title}\n${lc.content}`).join("\n\n---\n\n")}\n</LearningMaterial>\n\n`
			: ""

	const parsingNote =
		questionNumber && totalQuestions && totalQuestions > 1
			? `\n<ParsingInstructions>This is question ${questionNumber} of ${totalQuestions}. Extract the answer for THIS question from the student's response before marking.</ParsingInstructions>\n`
			: ""

	const stimulusSection = renderStimuliBlock(question.stimuli)

	return `Mark the answer against the provided mark scheme.

${learningSection}${stimulusSection}<Topic>\n${question.topic}\n</Topic>

<Question>\nQuestion ID: ${question.id}\nType: ${question.questionType}\n\n${question.questionText}\n</Question>

<MarkScheme>\nDescription: ${question.rubric}\n${question.guidance ? `Guidance: ${question.guidance}\n` : ""}\nTotal Points: ${question.totalPoints}\n\nMark Points:\n${markPointsList}\n</MarkScheme>

<StudentAnswer>\n${answer || "[No answer provided]"}\n</StudentAnswer>${parsingNote}

<MarkingRules>
- For each mark point, decide: met or not (true/false). Binary; no partial credit per point.
- Total marks awarded MUST NOT exceed ${question.totalPoints}
- If unsure, be conservative. Ignore spelling/grammar; focus on understanding.
</MarkingRules>

<Instructions>
For each mark point provide pointNumber, awarded, reasoning (max 15 words), expectedCriteria, studentCovered.
Set correctAnswer and relevantLearningSnippet to empty string.
feedbackSummary: 1 sentence, max 20 words — mark and key reason.
whatWentWell: 1-3 bullets, max 8 words each. Reference question context where possible.
whatDidntGoWell: 1-3 actionable improvement tips. Phrase as "Try..." or "Next time...". Reference question context. Max 8 words each. Never state what was wrong — only what to do better.
Output valid JSON matching the schema.
</Instructions>`
}
