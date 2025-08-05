import { z } from "zod";

export const MarkAnswerSchema = {
  answer_id: z.string().min(1).describe("The ID of the answer to mark"),
  include_mark_result: z.boolean(),
};
