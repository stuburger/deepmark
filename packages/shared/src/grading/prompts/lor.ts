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
	const rules = question.markingRules
	if (!rules?.levels?.length) {
		throw new Error(
			`LevelOfResponse marking requires markingRules.levels for question ${question.id}`,
		)
	}

	const levelSections = rules.levels
		.map(
			(l) =>
				`Level ${l.level} (${l.mark_range[0]}-${l.mark_range[1]} marks): ${l.descriptor}${l.ao_requirements?.length ? `\n  AO requirements: ${l.ao_requirements.join("; ")}` : ""}`,
		)
		.join("\n\n")

	const capsSection =
		rules.caps && rules.caps.length > 0
			? `\n<Caps>\n${rules.caps
					.map(
						(c) =>
							`- ${c.condition}: max_level=${c.max_level ?? "—"}, max_mark=${c.max_mark ?? "—"}. ${c.reason}`,
					)
					.join("\n")}\n</Caps>`
			: ""

	const commandWordNote = rules.command_word
		? `\nCommand word: ${rules.command_word}.`
		: ""
	const itemsNote =
		rules.items_required != null
			? ` Number of items required: ${rules.items_required}.`
			: ""

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

<MarkScheme>\n${question.rubric}${question.guidance ? `\nGuidance: ${question.guidance}` : ""}\n\nTotal marks available: ${question.totalPoints}.${commandWordNote}${itemsNote}
</MarkScheme>

<LevelDescriptors>
${levelSections}
</LevelDescriptors>${capsSection}${levelDescriptors ? `\n\n<ExamLevelDescriptors>\nGeneral level descriptors provided by the teacher for this exam.\nUse alongside the question-specific mark scheme to inform your marking.\n${levelDescriptors}\n</ExamLevelDescriptors>` : ""}

<StudentAnswer>\n${answer || "[No answer provided]"}\n</StudentAnswer>${parsingNote}

<MarkingRules>
- Decide the highest level the response demonstrates (use level descriptors and evidence from the text).
- Award a mark within that level's range. If a cap applies, do not exceed the cap.
- Provide levelAwarded (the level number, 1-based), whyNotNextLevel (why the next level was not reached, or empty if full marks), and capApplied (if a cap limited the mark, describe it; otherwise empty string).
- Evidence: quote short snippets; do not infer application not present in the text.
</MarkingRules>

<Instructions>
Output valid JSON matching the schema. Include questionId, markPointsResults, totalScore, llmReasoning, feedbackSummary, correctAnswer, relevantLearningSnippet, levelAwarded, whyNotNextLevel, capApplied, whatWentWell (1-3 short bullets, max 6 words each), and whatDidntGoWell (1-3 short bullets, max 6 words each, actionable).
</Instructions>`
}
