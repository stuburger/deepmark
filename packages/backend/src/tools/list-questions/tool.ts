import { ListQuestionsSchema } from "./schema";
import { questions } from "../../db/collections/questions";
import { tool, text } from "../tool-utils";

export const handler = tool(ListQuestionsSchema, async (args) => {
  const { subject } = args;

  console.log("[list-questions] Handler invoked", { subject });

  // Build query filter
  const filter: any = {};
  if (subject) {
    filter.subject = subject;
  }

  console.log("[list-questions] Querying questions", { filter });

  // Query the database
  const questionList = await questions.find().toArray();

  console.log("[list-questions] Found questions", {
    count: questionList.length,
  });

  if (questionList.length === 0) {
    const message = subject
      ? `No questions found for subject: ${subject}`
      : "No questions found in the database";

    return text(message);
  }

  // Format the response
  const questionsText = questionList
    .map((question, index) => {
      return `${index + 1}. ID: ${question._id}
   Topic: ${question.topic}
   Subject: ${question.subject}
   Points: ${question.points || "Not specified"}
   Difficulty: ${question.difficulty_level || "Not specified"}
   Created: ${question.created_at.toLocaleDateString()}
   Question: ${question.text.substring(0, 100)}${
        question.text.length > 100 ? "..." : ""
      }`;
    })
    .join("\n\n");

  return text(`Found ${questionList.length} question(s):\n\n${questionsText}`);
});
