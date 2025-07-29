import { CreateQuestionPartSchema } from "./schema";
import { questions } from "../../db/collections/questions";
import {
  QuestionPart,
  question_parts,
} from "../../db/collections/question-parts";
import { ObjectId } from "mongodb";
import { tool, text } from "../tool-utils";

export const handler = tool(CreateQuestionPartSchema, async (args) => {
  const {
    question_id,
    part_label,
    part_text,
    part_points,
    part_difficulty_level,
  } = args;

  console.log("[create-question-part] Handler invoked", {
    question_id,
    part_label,
    part_text,
    part_points,
    part_difficulty_level,
  });

  // Validate that the parent question exists
  const parentQuestion = await questions.findOne({
    _id: new ObjectId(question_id),
  });

  if (!parentQuestion) {
    throw new Error(
      `Parent question with ID ${question_id} not found. Please create the parent question first.`
    );
  }

  // Check if a part with this label already exists for this question
  const existingPart = await question_parts.findOne({
    question_id,
    part_label,
  });

  if (existingPart) {
    throw new Error(
      `A part with label '${part_label}' already exists for question ${question_id}.`
    );
  }

  // Get the next order number for this question
  const existingParts = await question_parts
    .find({ question_id })
    .sort({ order: -1 })
    .limit(1)
    .toArray();

  const nextOrder = existingParts.length > 0 ? existingParts[0].order + 1 : 1;

  // Create the question part document
  const questionPartData: QuestionPart = {
    _id: new ObjectId(),
    question_id,
    part_label,
    text: part_text,
    points: part_points || parentQuestion.points,
    difficulty_level: part_difficulty_level || parentQuestion.difficulty_level,
    order: nextOrder,
    created_by: "system", // TODO: Get from auth context when available
    created_at: new Date(),
    updated_at: new Date(),
  };

  console.log("[create-question-part] Creating question part", {
    questionPartData,
  });

  // Insert the question part into the database
  const result = await question_parts.insertOne(questionPartData);

  if (!result.insertedId) {
    console.log(
      "[create-question-part] Failed to insert question part - no insertedId returned"
    );
    throw new Error("Failed to insert question part into database");
  }

  console.log("[create-question-part] Question part created successfully", {
    questionPartId: result.insertedId,
  });

  return text(
    `Question part created successfully! Part ID: ${result.insertedId} (Part ${part_label} of question ${question_id})`
  );
});
