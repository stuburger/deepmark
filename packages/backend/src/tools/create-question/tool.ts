import { CreateQuestionSchema } from "./schema";
import { questions } from "../../db/collections/questions";
import { ObjectId } from "mongodb";
import { tool, text } from "../tool-utils";

// export const title = "Create a new GCSE question";

// export const description = "Create a new GCSE question";

export const handler = tool(CreateQuestionSchema, async (args) => {
  const { topic, question_text, points, difficulty_level, subject } = args;

  console.log("[create-question] Handler invoked", {
    topic,
    subject,
    points,
    difficulty_level,
  });

  // Create the question document
  const questionData = {
    _id: new ObjectId(),
    question_text,
    topic,
    subject,
    points,
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

  return text(
    `Question created successfully! Question ID: ${result.insertedId}`
  );
});
