import { z } from "zod";

export const ListAnswersByExamSessionSchema = {
  session_id: z
    .string()
    .describe("The ID of the exam session to list answers for"),
  include_question_details: z
    .boolean()
    .optional()
    .default(false)
    .describe("Whether to include full question details with each answer"),
};
