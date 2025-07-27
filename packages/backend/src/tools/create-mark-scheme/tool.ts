import { type ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CreateMarkSchemeSchema } from "./schema";
import { mark_schemes } from "../../db/collections/mark-schemes";
import { questions } from "../../db/collections/questions";
import { ObjectId } from "mongodb";
import { text, tool } from "../tool-utils";

export const handler = tool(CreateMarkSchemeSchema, async (args) => {
  const { question_id, points_total, mark_points } = args;

  console.log("[create-mark-scheme] Handler invoked", {
    question_id,
    points_total,
  });

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

  // Validate that the question exists
  const question = await questions.findOne({
    _id: new ObjectId(question_id),
  });

  if (!question) {
    throw new Error(
      `Question with ID ${question_id} not found. Please create the question first.`
    );
  }

  // Validate that all mark points have points value of 1
  const invalidPoints = mark_points.filter((point) => point.points !== 1);
  if (invalidPoints.length > 0) {
    throw new Error(
      `All mark points must have a points value of 1. Found ${invalidPoints.length} invalid mark points.`
    );
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

  console.log("[create-mark-scheme] Successfully created mark scheme", {
    mark_scheme_id: result.insertedId,
    question_id,
    points_total,
  });

  const questionPreview =
    question.question_text.substring(0, 100) +
    (question.question_text.length > 100 ? "..." : "");

  return text(
    `Mark scheme created successfully! Mark Scheme ID: ${result.insertedId}

Question: ${questionPreview}
Total Points: ${points_total}
Number of Mark Points: ${mark_points.length}`,
    {
      mark_scheme_id: result.insertedId.toString(),
      question_id,
      points_total,
      mark_points_count: mark_points.length,
      created_at: markSchemeData.created_at.toISOString(),
      created_by: markSchemeData.created_by,
    }
  );
});
