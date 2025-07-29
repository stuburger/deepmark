import { UpdateQuestionByIdSchema } from "./schema";
import { Question, questions } from "../../db/collections/questions";
import { ObjectId } from "mongodb";
import { tool, text } from "../tool-utils";

export const handler = tool(UpdateQuestionByIdSchema, async (args) => {
  const { id, topic, question_text, points, difficulty_level, subject } = args;

  // Check if the question exists
  const existingQuestion = await questions.findOne({ _id: new ObjectId(id) });

  if (!existingQuestion) {
    return text(`Question with ID ${id} not found.`);
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
    updateData.text = question_text;
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
  const result = await questions.updateOne(
    { _id: new ObjectId(id) },
    { $set: updateData }
  );

  if (result.matchedCount === 0) {
    return text(`Question with ID ${id} not found.`);
  }

  if (result.modifiedCount === 0) {
    return text(`Question with ID ${id} was found but no changes were made.`);
  }

  // Get the updated question for response
  const updatedQuestion = await questions.findOne({ _id: new ObjectId(id) });

  // Format the response
  const updatedFields = Object.keys(updateData).filter(
    (key) => key !== "updated_at"
  );
  const questionPreview = updatedQuestion?.text
    ? updatedQuestion.text.substring(0, 100) +
      (updatedQuestion.text.length > 100 ? "..." : "")
    : "No question text";

  return text(
    `Question updated successfully! Question ID: ${id}\n\nUpdated Fields: ${updatedFields.join(
      ", "
    )}\nTopic: ${updatedQuestion?.topic}\nSubject: ${
      updatedQuestion?.subject
    }\nPoints: ${updatedQuestion?.points || "Not specified"}\nDifficulty: ${
      updatedQuestion?.difficulty_level || "Not specified"
    }\n\nQuestion Preview: ${questionPreview}`
  );
});
