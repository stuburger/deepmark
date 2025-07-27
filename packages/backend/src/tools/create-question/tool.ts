import { CreateQuestionSchema } from "./schema";
import { Question, questions } from "../../db/collections/questions";
import { ObjectId } from "mongodb";
import { tool, text } from "../tool-utils";

// export const title = "Create a new GCSE question";

// export const description = "Create a new GCSE question";

export const handler = tool(CreateQuestionSchema, async (args) => {
  const {
    topic,
    question_text,
    points,
    difficulty_level,
    subject,
    parent_question_id,
    part_label,
  } = args;

  console.log("[create-question] Handler invoked", {
    topic,
    subject,
    points,
    difficulty_level,
    parent_question_id,
    part_label,
  });

  // Build the parent_question_ids array using the ancestors pattern
  let parent_question_ids: string[] = [];

  if (parent_question_id) {
    // Fetch the parent question to get its ancestors
    const parentQuestion = await questions.findOne({
      _id: new ObjectId(parent_question_id),
    });

    if (!parentQuestion) {
      throw new Error(
        `Parent question with ID ${parent_question_id} not found. Please create the parent question first.`
      );
    }

    // Build the ancestors array: parent's ancestors + parent's ID
    parent_question_ids = [
      ...parentQuestion.parent_question_ids,
      parent_question_id,
    ];
  }

  // Create the question document
  const questionData: Question = {
    _id: new ObjectId(),
    question_text,
    topic,
    subject,
    points,
    parent_question_ids,
    part_label: part_label || null,
    difficulty_level,
    created_by: "system", // TODO: Get from auth context when available
    created_at: new Date(),
    updated_at: new Date(),
  };

  console.log("[create-question] Creating question", { questionData });

  // Insert the question into the database
  const result = await questions.insertOne(questionData);

  if (!result.insertedId) {
    console.log(
      "[create-question] Failed to insert question - no insertedId returned"
    );
    throw new Error("Failed to insert question into database");
  }

  console.log("[create-question] Question created successfully", {
    questionId: result.insertedId,
  });

  const partInfo = part_label ? ` (Part ${part_label})` : "";
  const parentInfo =
    parent_question_ids && parent_question_ids.length > 0
      ? ` - Sub-question of: ${parent_question_ids.join(", ")}`
      : "";

  return text(
    `Question created successfully! Question ID: ${result.insertedId}${partInfo}${parentInfo}`
  );
});
