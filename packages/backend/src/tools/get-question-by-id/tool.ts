import { GetQuestionByIdSchema } from "./schema";
import { questions } from "../../db/collections/questions";
import { question_parts } from "../../db/collections/question-parts";
import { ObjectId } from "mongodb";
import { text, tool } from "../tool-utils";

export const handler = tool(GetQuestionByIdSchema, async (args) => {
  const { id } = args;

  // Query the database for the specific question
  const question = await questions.findOne({ _id: new ObjectId(id) });

  if (!question) {
    throw new Error(`Question with ID ${id} not found.`);
  }

  // Get all parts for this question, ordered by their order field
  const questionParts = await question_parts
    .find({ question_id: id })
    .sort({ order: 1 })
    .toArray();

  // Build the question details
  let questionDetails = `Question Details:
ID: ${question._id}
Topic: ${question.topic}
Subject: ${question.subject}
Points: ${question.points || "Not specified"}
Difficulty Level: ${question.difficulty_level || "Not specified"}
Created By: ${question.created_by}
Created At: ${question.created_at.toLocaleDateString()} ${question.created_at.toLocaleTimeString()}
Updated At: ${question.updated_at.toLocaleDateString()} ${question.updated_at.toLocaleTimeString()}

Question Text:
${question.text}`;

  // Add question parts if they exist
  if (questionParts.length > 0) {
    questionDetails += `\n\nQuestion Parts (${questionParts.length} total):`;

    questionParts.forEach((part, index) => {
      questionDetails += `\n\nPart ${part.part_label} (Order: ${part.order}):
ID: ${part._id}
Text: ${part.text}
Points: ${part.points || "Not specified"}
Difficulty Level: ${part.difficulty_level || "Not specified"}
Created At: ${part.created_at.toLocaleDateString()} ${part.created_at.toLocaleTimeString()}`;
    });
  } else {
    questionDetails += `\n\nQuestion Parts: None (this is a standalone question)`;
  }

  return text(questionDetails);
});
