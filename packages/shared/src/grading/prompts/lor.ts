import type { LearningContentItem, QuestionWithMarkScheme } from "../types"

/**
 * Builds the prompt for grading a single Level-of-Response question.
 * Pure function — no class dependency, no side effects.
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

	const learningSection =
		learningContent && learningContent.length > 0
			? `<LearningMaterial>\n${learningContent.map((lc) => `## ${lc.title}\n${lc.content}`).join("\n\n---\n\n")}\n</LearningMaterial>\n\n`
			: ""

	const parsingNote =
		questionNumber && totalQuestions && totalQuestions > 1
			? `\n<ParsingInstructions>This is question ${questionNumber} of ${totalQuestions}. Extract the answer for THIS question from the student's response before marking.</ParsingInstructions>\n`
			: ""

	return `Mark this answer using Level of Response marking. First decide which level the response reaches, then award a mark within that level's range. Quote short snippets from the student's text as evidence; do not infer application not present in the text.

${learningSection}<Topic>\n${question.topic}\n</Topic>

<Question>\nQuestion ID: ${question.id}\n\n${question.questionText}\n</Question>

<MarkScheme>\n${question.rubric}${question.guidance ? `\nGuidance: ${question.guidance}` : ""}\n\nTotal marks available: ${question.totalPoints}.
</MarkScheme>

<MarkSchemeContent>
${question.content}
</MarkSchemeContent>${levelDescriptors ? `\n\n<TeacherMarkingGuidance>\nTeacher-authored marking guidance for this exam. May include level descriptors, feedback style instructions, and/or few-shot examples.\nUse alongside the question-specific mark scheme to inform your marking and feedback style.\n${levelDescriptors}\n</TeacherMarkingGuidance>` : ""}

<StudentAnswer>\n${answer || "[No answer provided]"}\n</StudentAnswer>${parsingNote}

<MarkingRules>
- Decide the highest level the response demonstrates (use level descriptors and evidence from the text).
- Award a mark within that level's range. If a cap applies, do not exceed the cap.
- Provide levelAwarded (the level number, 1-based), whyNotNextLevel (why the next level was not reached, or empty if full marks), and capApplied (if a cap limited the mark, describe it; otherwise empty string).
- Evidence: quote short snippets; do not infer application not present in the text.
</MarkingRules>

<Instructions>
Set correctAnswer and relevantLearningSnippet to empty string.
feedbackSummary: 1 sentence, max 20 words — level, mark, and key reason.
whatWentWell: 1-3 bullets, max 8 words each. Reference the question context where possible.
whatDidntGoWell: 1-3 actionable improvement tips. Phrase as "Try..." or "Next time...". Reference the question context. Max 8 words each. Never state what was wrong — only what to do better.
markPointsResults reasoning: max 15 words per point.
Output valid JSON matching the schema.
</Instructions>`
}
