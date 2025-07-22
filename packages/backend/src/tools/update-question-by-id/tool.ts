import { type ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { UpdateQuestionByIdSchema } from "./schema";
import { Question, questions } from "../../db/collections/questions";

export const handler: ToolCallback<typeof UpdateQuestionByIdSchema> = async (
  args
) => {
  const { id, topic, question_text, points, difficulty_level, subject } = args;

  try {
    // Check if the question exists
    const existingQuestion = await questions.findOne({ _id: id });
    if (!existingQuestion) {
      return {
        content: [
          {
            type: "text",
            text: `Question with ID ${id} not found.`,
          },
        ],
      };
    }

    // Prepare update data
    const updateData: Partial<Question> = {
      updated_at: new Date(),
    };

    // Add optional fields if provided
    if (topic !== undefined) {
      updateData.topic = topic;
    }

    if (question_text !== undefined) {
      updateData.question_text = question_text;
    }

    if (points !== undefined) {
      updateData.points = points;
    }

    if (difficulty_level !== undefined) {
      updateData.difficulty_level = difficulty_level;
    }

    if (subject !== undefined) {
      updateData.subject = subject;
    }

    // Update the question in the database
    const result = await questions.updateOne({ _id: id }, { $set: updateData });

    if (result.matchedCount === 0) {
      return {
        content: [
          {
            type: "text",
            text: `Question with ID ${id} not found.`,
          },
        ],
      };
    }

    if (result.modifiedCount === 0) {
      return {
        content: [
          {
            type: "text",
            text: `Question with ID ${id} was found but no changes were made.`,
          },
        ],
      };
    }

    // Get the updated question for response
    const updatedQuestion = await questions.findOne({ _id: id });

    // Format the response
    const updatedFields = Object.keys(updateData).filter(
      (key) => key !== "updated_at"
    );
    const questionPreview = updatedQuestion?.question_text
      ? updatedQuestion.question_text.substring(0, 100) +
        (updatedQuestion.question_text.length > 100 ? "..." : "")
      : "No question text";

    return {
      content: [
        {
          type: "text",
          text: `Question updated successfully! Question ID: ${id}\n\nUpdated Fields: ${updatedFields.join(
            ", "
          )}\nTopic: ${updatedQuestion?.topic}\nSubject: ${
            updatedQuestion?.subject
          }\nPoints: ${
            updatedQuestion?.points || "Not specified"
          }\nDifficulty: ${
            updatedQuestion?.difficulty_level || "Not specified"
          }\n\nQuestion Preview: ${questionPreview}`,
        },
      ],
    };
  } catch (error) {
    console.error("Error updating question:", error);
    return {
      content: [
        {
          type: "text",
          text: `Failed to update question: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        },
      ],
    };
  }
};
