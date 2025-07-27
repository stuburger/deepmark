import { type ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CreateMarkSchemeSchema } from "./schema";
import { mark_schemes } from "../../db/collections/mark-schemes";
import { questions } from "../../db/collections/questions";
import { ObjectId } from "mongodb";

export const handler: ToolCallback<typeof CreateMarkSchemeSchema> = async (
  args
) => {
  const { question_id, points_total, mark_points } = args;

  // Validate total points matches sum of mark points
  const totalMarkPoints = mark_points.reduce(
    (sum, point) => sum + point.points,
    0
  );

  if (totalMarkPoints !== points_total) {
    throw new Error(
      `Total points (${points_total}) does not match sum of mark points (${totalMarkPoints})`
    );
  }

  // Validate number of mark points matches points total
  if (mark_points.length !== points_total) {
    throw new Error(
      `Number of mark points (${mark_points.length}) does not match points total (${points_total})`
    );
  }

  try {
    // Validate that the question exists
    const question = await questions.findOne({
      _id: new ObjectId(question_id),
    });

    if (!question) {
      return {
        content: [
          {
            type: "text",
            text: `Question with ID ${question_id} not found. Please create the question first.`,
          },
        ],
      };
    }

    // Validate that mark_points length matches points_total
    if (mark_points.length !== points_total) {
      return {
        content: [
          {
            type: "text",
            text: `Validation error: Number of mark points (${mark_points.length}) does not match points total (${points_total}).`,
          },
        ],
      };
    }

    // Validate that all mark points have points value of 1
    const invalidPoints = mark_points.filter((point) => point.points !== 1);
    if (invalidPoints.length > 0) {
      return {
        content: [
          {
            type: "text",
            text: `Validation error: All mark points must have a points value of 1. Found ${invalidPoints.length} invalid mark points.`,
          },
        ],
      };
    }

    // Create the mark scheme document
    const markSchemeData = {
      _id: new ObjectId(),
      question_id,
      points_total,
      mark_points,
      created_by: "system", // TODO: Get from auth context when available
      created_at: new Date(),
      updated_at: new Date(),
    };

    // Insert the mark scheme into the database
    const result = await mark_schemes.insertOne(markSchemeData);

    if (!result.insertedId) {
      throw new Error("Failed to insert mark scheme into database");
    }

    return {
      content: [
        {
          type: "text",
          text: `Mark scheme created successfully! Mark Scheme ID: ${
            result.insertedId
          }\n\nQuestion: ${question.question_text.substring(0, 100)}${
            question.question_text.length > 100 ? "..." : ""
          }\nTotal Points: ${points_total}\nNumber of Mark Points: ${
            mark_points.length
          }`,
        },
      ],
    };
  } catch (error) {
    console.error("Error creating mark scheme:", error);
    return {
      content: [
        {
          type: "text",
          text: `Failed to create mark scheme: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        },
      ],
    };
  }
};
