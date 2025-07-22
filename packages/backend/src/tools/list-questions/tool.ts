import { type ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ListQuestionsSchema } from "./schema";
import { questions } from "../../db/collections/questions";

export const handler: ToolCallback<typeof ListQuestionsSchema> = async (
  args
) => {
  const { subject } = args;

  try {
    // Build query filter
    const filter: any = {};
    if (subject) {
      filter.subject = subject;
    }

    // Query the database
    const questionList = await questions.find(filter).toArray();

    if (questionList.length === 0) {
      const message = subject
        ? `No questions found for subject: ${subject}`
        : "No questions found in the database";

      return {
        content: [
          {
            type: "text",
            text: message,
          },
        ],
      };
    }

    // Format the response
    const questionsText = questionList
      .map((question, index) => {
        return `${index + 1}. ID: ${question._id}
   Topic: ${question.topic}
   Subject: ${question.subject}
   Points: ${question.points || "Not specified"}
   Difficulty: ${question.difficulty_level || "Not specified"}
   Created: ${question.created_at.toLocaleDateString()}
   Question: ${question.question_text.substring(0, 100)}${
          question.question_text.length > 100 ? "..." : ""
        }`;
      })
      .join("\n\n");

    return {
      content: [
        {
          type: "text",
          text: `Found ${questionList.length} question(s):\n\n${questionsText}`,
        },
      ],
    };
  } catch (error) {
    console.error("Error listing questions:", error);
    return {
      content: [
        {
          type: "text",
          text: `Failed to list questions: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        },
      ],
    };
  }
};
