import { GetMarkResultByIdSchema } from "./schema"
import { marking_results } from "../../db/collections/marking-results"
import { answers } from "../../db/collections/answers"
import { ObjectId } from "mongodb"
import { text, tool } from "../tool-utils"

export const handler = tool(GetMarkResultByIdSchema, async (args, extra) => {
	const { answer_id } = args

	console.log("[get-mark-result-by-id] Handler invoked", { answer_id })

	const answer = await answers.findOne({ _id: new ObjectId(answer_id) })

	if (!answer) {
		throw Error(`Answer with ID ${answer_id} not found.`)
	}

	const markingResult = await marking_results.findOne({ answer_id })

	if (!markingResult) {
		throw Error(
			`No marking result found for answer ${answer_id}. The answer may not have been marked yet.`,
		)
	}

	// Format the marking result details
	const markPointsDetails = markingResult.mark_points_results
		.map((mp) => {
			const status = mp.awarded ? "✓ AWARDED" : "✗ NOT AWARDED"
			return `Point ${mp.point_number}: ${status}
  Expected: ${mp.expected_criteria}
  Student covered: ${mp.student_covered}
  Reasoning: ${mp.reasoning}`
		})
		.join("\n\n")

	const markingResultDetails = `Marking Result Details:
Answer ID: ${markingResult.answer_id}
Total Score: ${markingResult.total_score}/${markingResult.max_possible_score}
Marked At: ${markingResult.marked_at.toLocaleDateString()} ${markingResult.marked_at.toLocaleTimeString()}

Mark Points Results:
${markPointsDetails}

LLM Reasoning:
${markingResult.llm_reasoning}

Feedback Summary:
${markingResult.feedback_summary}`

	console.log("[get-mark-result-by-id] Successfully retrieved marking result", {
		answer_id,
		total_score: markingResult.total_score,
	})

	return text(markingResultDetails, {
		answer_id: markingResult.answer_id,
		total_score: markingResult.total_score,
		max_possible_score: markingResult.max_possible_score,
		marked_at: markingResult.marked_at.toISOString(),
		mark_points_count: markingResult.mark_points_results.length,
	})
})
