import { z } from "zod";

export const CompleteExamSessionSchema = {
  session_id: z.string().describe("The ID of the exam session to complete"),
  total_score: z
    .number()
    .positive()
    .describe("The total score achieved by the student"),
  status: z
    .enum(["completed", "abandoned"])
    .optional()
    .default("completed")
    .describe("The final status of the exam session"),
};
