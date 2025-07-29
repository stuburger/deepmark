import { z } from "zod";

export const ListAnswersByExamSessionSchema = {
  session_id: z
    .string()
    .describe("The ID of the exam session to list answers for"),
};
