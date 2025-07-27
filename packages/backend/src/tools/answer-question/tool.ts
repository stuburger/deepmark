import { type ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AnswerQuestionSchema } from "./schema";
import { Answer, answers } from "../../db/collections/answers";
import { questions } from "../../db/collections/questions";
import { ObjectId } from "mongodb";
import { text, tool } from "../tool-utils";

export const handler = tool(AnswerQuestionSchema, async (args, extra) => {
  const { question_id, student_answer, student_id } = args;

  console.log("[answer-question] Handler invoked", { question_id, student_id });

  // Verify the question exists and get its details
  const question = await questions.findOne({
    _id: new ObjectId(question_id),
  });

  if (!question) {
    throw new Error(`Question with ID ${question_id} not found.`);
  }

  // Create the answer document
  const answerData: Answer = {
    _id: new ObjectId(),
    question_id,
    student_id,
    student_answer,
    submitted_at: new Date(),
    max_possible_score: question.points || 0,
    marking_status: "pending" as const,
  };

  // Insert the answer into the database
  const result = await answers.insertOne(answerData);

  if (!result.insertedId) {
    throw new Error("Failed to insert answer into database");
  }

  console.log("[answer-question] Successfully submitted answer", {
    answer_id: result.insertedId,
    question_id,
    student_id,
  });

  return text(
    `Answer submitted successfully! Answer ID: ${result.insertedId}`,
    {
      answer_id: result.insertedId.toString(),
      question_id,
      student_id,
      submitted_at: answerData.submitted_at.toISOString(),
      max_possible_score: answerData.max_possible_score,
      marking_status: answerData.marking_status,
    }
  );
});
