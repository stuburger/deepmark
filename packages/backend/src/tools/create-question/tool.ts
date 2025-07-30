import { CreateQuestionSchema } from "./schema";
import { prisma } from "../../db/client";
import { tool, text } from "../tool-utils";

export const handler = tool(CreateQuestionSchema, async (args) => {
  const { topic, question_text, points, difficulty_level, subject } = args;

  console.log("[create-question] Handler invoked", {
    topic,
    subject,
    points,
    difficulty_level,
  });

  // Check if Prisma client is available
  if (!prisma) {
    throw new Error(
      "Prisma client not available. Please run 'npx prisma generate' first."
    );
  }

  // TODO: Get actual user from auth context when available
  // For now, find or create a system user
  let systemUser = await prisma.user.findUnique({
    where: { email: "system@example.com" },
  });

  if (!systemUser) {
    systemUser = await prisma.user.create({
      data: {
        email: "system@example.com",
        name: "System",
        role: "admin",
      },
    });
    console.log("[create-question] Created system user", {
      userId: systemUser.id,
    });
  }

  console.log("[create-question] Creating question with user", {
    userId: systemUser.id,
  });

  // Create the question using Prisma
  const question = await prisma.question.create({
    data: {
      text: question_text,
      topic,
      subject,
      points,
      difficulty_level,
      created_by_id: systemUser.id,
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
