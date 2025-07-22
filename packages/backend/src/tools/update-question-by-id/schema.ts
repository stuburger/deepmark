import { z } from "zod";

export const UpdateQuestionByIdSchema = {
  id: z.string().describe("The unique identifier for the question to update"),
  topic: z
    .string()
    .min(1)
    .optional()
    .describe("The topic or subject matter for the question"),
  question_text: z.string().optional().describe("The exam question"),
  points: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Number of marks the question is worth"),
  difficulty_level: z
    .enum(["easy", "medium", "hard", "expert"])
    .optional()
    .describe("Difficulty level of the question"),
  subject: z
    .enum(["biology", "chemistry", "physics", "english"])
    .optional()
    .describe("Subject area for the question"),
};
