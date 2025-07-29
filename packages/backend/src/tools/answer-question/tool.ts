import { type ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AnswerQuestionSchema } from "./schema";
import { Answer, answers } from "../../db/collections/answers";
import { questions } from "../../db/collections/questions";
import {
  question_parts,
  QuestionPart,
} from "../../db/collections/question-parts";
import { ObjectId } from "mongodb";
import { text, tool } from "../tool-utils";

export const handler = tool(AnswerQuestionSchema, async (args, extra) => {
  const { question_id, question_part_id, student_answer, student_id } = args;

  console.log("[answer-question] Handler invoked", {
    question_id,
    question_part_id,
    student_id,
  });

  // Verify the question exists and get its details
  const question = await questions.findOne({
    _id: new ObjectId(question_id),
  });

  if (!question) {
    throw new Error(`Question with ID ${question_id} not found.`);
  }

  // If question_part_id is provided, verify the part exists
  let questionPart: QuestionPart | null = null;
  let maxPossibleScore = question.points || 0;

  if (question_part_id) {
    questionPart = await question_parts.findOne({
      _id: new ObjectId(question_part_id),
      question_id: question_id, // Ensure the part belongs to the question
    });

    if (!questionPart) {
      throw new Error(
        `Question part with ID ${question_part_id} not found for question ${question_id}.`
      );
    }

    // Use the part's points if available, otherwise use parent question points
    maxPossibleScore = questionPart.points || question.points || 0;
  }

  // Create the answer document
  const answerData: Answer = {
    _id: new ObjectId(),
    question_id,
    question_part_id: question_part_id || undefined,
    student_id,
    student_answer,
    submitted_at: new Date(),
    max_possible_score: maxPossibleScore,
    marking_status: "pending" as const,
  };

  // Insert the answer into the database
  const result = await answers.insertOne(answerData);

  if (!result.insertedId) {
    throw new Error("Failed to insert answer into database");
  }

  const partInfo = questionPart ? ` (Part ${questionPart.part_label})` : "";

  console.log("[answer-question] Successfully submitted answer", {
    answer_id: result.insertedId,
    question_id,
    question_part_id,
    student_id,
  });

  return text(
    `Answer submitted successfully! Answer ID: ${result.insertedId}${partInfo}`,
    {
      answer_id: result.insertedId.toString(),
      question_id,
      question_part_id: question_part_id || null,
      student_id,
      submitted_at: answerData.submitted_at.toISOString(),
      max_possible_score: answerData.max_possible_score,
      marking_status: answerData.marking_status,
    }
  );
});
