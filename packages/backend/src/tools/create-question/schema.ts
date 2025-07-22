import { z } from "zod";

export const CreateQuestionSchema = {
  topic: z
    .string()
    .min(1)
    .describe("The topic or subject matter for the question"),
  question_text: z.string().describe("The exam question"),
  points: z
    .number()
    .int()
    .positive()
    .describe("Number of marks the question is worth"),
  difficulty_level: z
    .enum(["easy", "medium", "hard", "expert"])
    .describe("Difficulty level of the question"),
  subject: z
    .enum(["biology", "chemistry", "physics", "english"])
    .describe("Subject area for the question"),
};
