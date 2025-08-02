import { GetMarkResultByAnswerIdSchema } from "./schema"
import { tool } from "../tool-utils"
import { db } from "@/db"

export const handler = tool(
	GetMarkResultByAnswerIdSchema,
	async (args, extra) => {
		const { answer_id } = args

		console.log("[get-mark-result-by-id] Handler invoked", { answer_id })

		const answer = await db.answer.findUniqueOrThrow({
			where: { id: answer_id },
			include: { marking_results: true },
		})

		if (!answer.marking_results.length) {
			throw Error(
				`No marking result found for answer ${answer_id}. The answer may not have been marked yet.`,
			)
		}

		const [most_recent_mark] = answer.marking_results.sort(
			(a, b) => b.marked_at.getTime() - a.marked_at.getTime(),
		)

		// Format the marking result details
		const markPointsDetails = most_recent_mark.mark_points_results
			.map((mp) => {
				const status = mp.awarded ? "✓ AWARDED" : "✗ NOT AWARDED"
				return `Point ${mp.point_number}: ${status}
  Expected: ${mp.expected_criteria}
  Student covered: ${mp.student_covered}
  Reasoning: ${mp.reasoning}`
			})
			.join("\n\n")

		const markingResultDetails = `Marking Result Details:
Answer ID: ${most_recent_mark.answer_id}
Total Score: ${most_recent_mark.total_score}/${most_recent_mark.max_possible_score}
Marked At: ${most_recent_mark.marked_at.toLocaleDateString()} ${most_recent_mark.marked_at.toLocaleTimeString()}

Mark Points Results:
${markPointsDetails}

LLM Reasoning:
${most_recent_mark.llm_reasoning}

Feedback Summary:
${most_recent_mark.feedback_summary}`

		console.log(
			"[get-mark-result-by-id] Successfully retrieved marking result",
			{
				answer_id,
				total_score: most_recent_mark.total_score,
			},
		)

		return markingResultDetails
	},
)
