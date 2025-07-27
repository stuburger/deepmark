import { type ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GetMarkResultByIdSchema } from "./schema";
import { marking_results } from "../../db/collections/marking-results";
import { answers } from "../../db/collections/answers";
import { ObjectId } from "mongodb";

export const handler: ToolCallback<typeof GetMarkResultByIdSchema> = async (
  args
) => {
  const { answer_id } = args;

  console.log("[get-mark-result-by-id] Handler invoked", { answer_id });

  try {
    // First check if the answer exists
    const answer = await answers.findOne({ _id: new ObjectId(answer_id) });

    if (!answer) {
      console.log(`[get-mark-result-by-id] Answer not found: ${answer_id}`);
      return {
        content: [
          {
            type: "text",
            text: `Answer with ID ${answer_id} not found.`,
          },
        ],
      };
    }

    // Query the database for the marking result
    const markingResult = await marking_results.findOne({ answer_id });

    if (!markingResult) {
      console.log(
        `[get-mark-result-by-id] Marking result not found for answer: ${answer_id}`
      );
      return {
        content: [
          {
            type: "text",
            text: `No marking result found for answer ${answer_id}. The answer may not have been marked yet.`,
          },
        ],
      };
    }

    // Format the marking result details
    const markPointsDetails = markingResult.mark_points_results
      .map((mp) => {
        const status = mp.awarded ? "✓ AWARDED" : "✗ NOT AWARDED";
        return `Point ${mp.point_number}: ${status}
  Expected: ${mp.expected_criteria}
  Student covered: ${mp.student_covered}
  Reasoning: ${mp.reasoning}`;
      })
      .join("\n\n");

    const markingResultDetails = `Marking Result Details:
Answer ID: ${markingResult.answer_id}
Total Score: ${markingResult.total_score}/${markingResult.max_possible_score}
Marked At: ${markingResult.marked_at.toLocaleDateString()} ${markingResult.marked_at.toLocaleTimeString()}

Mark Points Results:
${markPointsDetails}

LLM Reasoning:
${markingResult.llm_reasoning}

Feedback Summary:
${markingResult.feedback_summary}`;

    console.log(
      "[get-mark-result-by-id] Successfully retrieved marking result",
      {
        answer_id,
        total_score: markingResult.total_score,
      }
    );

    return {
      content: [
        {
          type: "text",
          text: markingResultDetails,
        },
      ],
    };
  } catch (error) {
    console.error(
      "[get-mark-result-by-id] Error retrieving marking result:",
      error
    );
    return {
      content: [
        {
          type: "text",
          text: `Failed to retrieve marking result: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        },
      ],
    };
  }
};
