import { type ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AnswerQuestionSchema } from "./schema";
import { Answer, answers } from "../../db/collections/answers";
import { questions } from "../../db/collections/questions";
import { ObjectId } from "mongodb";

export const handler: ToolCallback<typeof AnswerQuestionSchema> = async (
  args,
  extra
) => {
  const { question_id, student_answer, student_id } = args;

  try {
    // Verify the question exists and get its details
    const question = await questions.findOne({
      _id: new ObjectId(question_id),
    });

    if (!question) {
      return {
        content: [
          {
            type: "text",
            text: `Question with ID ${question_id} not found.`,
          },
        ],
      };
    }

    // Create the answer document
    const answerData: Answer = {
      _id: new ObjectId(),
      question_id,
      student_id,
      student_answer,
      submitted_at: new Date(),
      max_possible_score: question.points || 0,
      marking_status: "pending" as const,
    };

    // Insert the answer into the database
    const result = await answers.insertOne(answerData);

    if (!result.insertedId) {
      throw new Error("Failed to insert answer into database");
    }

    return {
      content: [
        {
          type: "text",
          text: `Answer submitted successfully! Answer ID: ${result.insertedId}`,
        },
      ],
    };
  } catch (error) {
    console.error("Error submitting answer:", error);
    return {
      content: [
        {
          type: "text",
          text: `Failed to submit answer: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        },
      ],
    };
  }
};
