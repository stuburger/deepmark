import { type ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GetQuestionByIdSchema } from "./schema";
import { questions } from "../../db/collections/questions";
import { ObjectId } from "mongodb";
import { text, tool } from "../tool-utils";

export const handler = tool(GetQuestionByIdSchema, async (args) => {
  const { id } = args;

  // Query the database for the specific question
  const question = await questions.findOne({ _id: new ObjectId(id) });

  if (!question) {
    throw new Error(`Question with ID ${id} not found.`);
  }

  const questionDetails = `Question Details:
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

  return text(questionDetails);
});
