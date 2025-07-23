import { type ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GetQuestionByIdSchema } from "./schema";
import { questions } from "../../db/collections/questions";
import { ObjectId } from "mongodb";

export const handler: ToolCallback<typeof GetQuestionByIdSchema> = async (
  args
) => {
  const { id } = args;

  try {
    // Query the database for the specific question
    const question = await questions.findOne({ _id: new ObjectId(id) });

    if (!question) {
      return {
        content: [
          {
            type: "text",
            text: `Question with ID ${id} not found.`,
          },
        ],
      };
    }

    // Format the question details
    const questionDetails = `Question Details:
ID: ${question._id}
Topic: ${question.topic}
Subject: ${question.subject}
Points: ${question.points || "Not specified"}
Difficulty Level: ${question.difficulty_level || "Not specified"}
Created By: ${question.created_by}
Created At: ${question.created_at.toLocaleDateString()} ${question.created_at.toLocaleTimeString()}
Updated At: ${question.updated_at.toLocaleDateString()} ${question.updated_at.toLocaleTimeString()}

Question Text:
${question.question_text}`;

    return {
      content: [
        {
          type: "text",
          text: questionDetails,
        },
      ],
    };
  } catch (error) {
    console.error("Error retrieving question:", error);
    return {
      content: [
        {
          type: "text",
          text: `Failed to retrieve question: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        },
      ],
    };
  }
};
