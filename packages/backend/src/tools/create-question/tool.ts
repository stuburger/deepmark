import { type ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CreateQuestionSchema } from "./schema";
import { questions } from "../../db/collections/questions";

export const handler: ToolCallback<typeof CreateQuestionSchema> = async (
  args
) => {
  const { topic, question_text, points, difficulty_level, subject } = args;

  try {
    // Create the question document
    const questionData = {
      question_text,
      topic,
      subject,
      points,
      difficulty_level,
      created_by: "system", // TODO: Get from auth context when available
      created_at: new Date(),
      updated_at: new Date(),
    };

    // Insert the question into the database
    const result = await questions.insertOne(questionData);

    if (!result.insertedId) {
      throw new Error("Failed to insert question into database");
    }

    return {
      content: [
        {
          type: "text",
          text: `Question created successfully! Question ID: ${result.insertedId}`,
        },
      ],
    };
  } catch (error) {
    console.error("Error creating question:", error);
    return {
      content: [
        {
          type: "text",
          text: `Failed to create question: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        },
      ],
    };
  }
};
