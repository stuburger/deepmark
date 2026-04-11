import { db } from "@/db"
import { markAnswerById } from "@/services/mark-answer"
import { tool } from "@/tools/shared/tool-utils"
import { MarkAnswerSchema } from "./schema"

export const handler = tool(MarkAnswerSchema, async (args) => {
	const { answer_id, include_mark_result } = args

	const result = await markAnswerById(answer_id)

	if (!result.marked) {
		return `Answer ${answer_id} has already been marked.${result.total_score != null ? ` Score: ${result.total_score}/${result.max_possible_score}` : ""}`
	}

	let responseText = `Answer marked successfully! Score: ${result.total_score}/${result.max_possible_score}`

	if (include_mark_result) {
		const mr = await db.markingResult.findFirst({
			where: { answer_id },
			orderBy: { marked_at: "desc" },
		})
		if (mr) {
			responseText += `\n\nMarking Result:\n${JSON.stringify(
				{
					mark_points_results: mr.mark_points_results,
					total_score: mr.total_score,
					llm_reasoning: mr.llm_reasoning,
					feedback_summary: mr.feedback_summary,
				},
				null,
				2,
			)}`
		}
	}

	return responseText
})
