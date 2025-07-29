import { type ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CreateMarkSchemeSchema } from "./schema";
import { mark_schemes, MarkScheme } from "../../db/collections/mark-schemes";
import { questions } from "../../db/collections/questions";
import {
  question_parts,
  QuestionPart,
} from "../../db/collections/question-parts";
import { ObjectId } from "mongodb";
import { text, tool } from "../tool-utils";

export const handler = tool(CreateMarkSchemeSchema, async (args) => {
  const {
    question_id,
    question_part_id,
    description,
    guidance,
    points_total,
    mark_points,
    tags = [],
  } = args;

  console.log("[create-mark-scheme] Handler invoked", {
    question_id,
    question_part_id,
    points_total,
    tags,
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

  // If question_part_id is provided, validate that the question part exists
  let questionPart: QuestionPart | null = null;
  if (question_part_id) {
    questionPart = await question_parts.findOne({
      _id: new ObjectId(question_part_id),
      question_id: question_id, // Ensure the part belongs to the question
    });

    if (!questionPart) {
      throw new Error(
        `Question part with ID ${question_part_id} not found for question ${question_id}. Please create the question part first.`
      );
    }
  }

  // Validate that all mark points have points value of 1
  const invalidPoints = mark_points.filter((point) => point.points !== 1);
  if (invalidPoints.length > 0) {
    throw new Error(
      `All mark points must have a points value of 1. Found ${invalidPoints.length} invalid mark points.`
    );
  }

  // Create the mark scheme document
  const markSchemeData: MarkScheme = {
    _id: new ObjectId(),
    question_id,
    question_part_id: question_part_id || undefined,
    description,
    guidance,
    points_total,
    tags: tags || [],
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
    question_part_id,
    points_total,
  });

  // Get the text to display (question or question part)
  const questionText = questionPart ? questionPart.text : question.text;
  const partInfo = questionPart ? ` (Part ${questionPart.part_label})` : "";

  const questionPreview =
    questionText.substring(0, 100) + (questionText.length > 100 ? "..." : "");

  const tagsInfo = tags && tags.length > 0 ? `\nTags: ${tags.join(", ")}` : "";

  return text(
    `Mark scheme created successfully! Mark Scheme ID: ${result.insertedId}

Question${partInfo}: ${questionPreview}
Description: ${description}${tagsInfo}
Total Points: ${points_total}
Number of Mark Points: ${mark_points.length}`,
    {
      mark_scheme_id: result.insertedId.toString(),
      question_id,
      question_part_id: question_part_id || null,
      description,
      guidance,
      tags,
      points_total,
      mark_points_count: mark_points.length,
      created_at: markSchemeData.created_at.toISOString(),
      created_by: markSchemeData.created_by,
    }
  );
});
