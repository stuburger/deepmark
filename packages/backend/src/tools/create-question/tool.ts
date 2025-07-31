import { CreateQuestionSchema } from "./schema";
import { db } from "../../db/client";
import { tool, text } from "../tool-utils";
import { ObjectId } from "mongodb";

export const handler = tool(CreateQuestionSchema, async (args, extra) => {
  const { topic, question_text, points, difficulty_level, subject } = args;

  console.log("[create-question] Handler invoked", {
    topic,
    subject,
    points,
    difficulty_level,
  });

  // Create the question using Prisma
  const question = await db.question.create({
    data: {
      text: question_text,
      topic,
      subject,
      points,
      difficulty_level,
      created_by_id: new ObjectId().toString(),
    },
    include: {
      created_by: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  console.log("[create-question] Question created successfully", {
    questionId: question.id,
    createdBy: question.created_by,
  });

  return text(
    `Question created successfully! Question ID: ${question.id}\nCreated by: ${question.created_by.name} (${question.created_by.email})`
  );
});
