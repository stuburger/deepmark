import { z } from "zod";

export const ListQuestionsByExamPaperSchema = {
  exam_paper_id: z
    .string()
    .describe("The ID of the exam paper to list questions for"),
  include_details: z
    .boolean()
    .optional()
    .default(false)
    .describe("Whether to include full question details or just IDs"),
};
