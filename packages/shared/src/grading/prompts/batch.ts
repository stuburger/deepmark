import type {
	LearningContentItem,
	ParsedResponse,
	QuestionWithMarkScheme,
} from "../types"

/**
 * Builds the prompt for batch-grading multiple questions at once.
 * Pure function — no class dependency, no side effects.
 */
export function buildBatchPrompt(
	questions: QuestionWithMarkScheme[],
	responses: ParsedResponse[],
	learningContent: LearningContentItem[],
): string {
	const learningSection =
		learningContent.length > 0
			? `<LearningMaterial>\n${learningContent
					.map((lc, i) => `## ${i + 1}. ${lc.title}\n\n${lc.content}`)
					.join("\n\n---\n\n")}\n</LearningMaterial>\n\n`
			: ""

	const questionsSection = questions
		.map((q, index) => {
			const response = responses.find((r) => r.questionId === q.id)
			const answer = response?.answer ?? "[No answer provided]"
			const markPointsList = q.markPoints
				.map(
					(mp) =>
						`   [pointNumber: ${mp.pointNumber}] ${mp.description} (${mp.points} mark${mp.points > 1 ? "s" : ""}${mp.isRequired ? ", REQUIRED" : ""})\n   Criteria: ${mp.criteria}`,
				)
				.join("\n\n")
			return `### Question ${index + 1} [ID: ${q.id}]
Type: ${q.questionType}
Total Points: ${q.totalPoints}

**Topic:** ${q.topic}

**Question:**\n${q.questionText}

**Mark Scheme:**\n${q.rubric}\n${q.guidance ? `\nGuidance: ${q.guidance}` : ""}

Mark Points:\n${markPointsList}

**Student's Answer:**\n${answer}`
		})
		.join("\n\n---\n\n")

	return `${learningSection}<Assessment>\n${questionsSection}\n</Assessment>

<MarkingRules>
- For each mark point, decide: was this mark point met? (true/false)
- Each mark point is binary: fully met or not met (no partial credit per point)
- Total marks awarded MUST NOT exceed the question's total points
- If unsure, be conservative (don't award)
- Ignore spelling/grammar; focus on correct concepts
</MarkingRules>

<Instructions>
For EACH question: questionId, markPointsResults (pointNumber, awarded, reasoning max 15 words, expectedCriteria, studentCovered), totalScore, llmReasoning, feedbackSummary (1 sentence max 20 words), whatWentWell (1-3 bullets max 8 words, reference question context), whatDidntGoWell (1-3 actionable tips phrased as "Try..." or "Next time...", max 8 words, reference question context, never state what was wrong).
Set correctAnswer and relevantLearningSnippet to empty string.
Output valid JSON matching the schema.
</Instructions>`
}
