import { z } from "zod";

export const ReorderQuestionsInExamPaperSchema = {
  exam_paper_id: z
    .string()
    .describe("The ID of the exam paper to reorder questions in"),
  section_id: z
    .string()
    .describe("The ID of the section to reorder questions in"),
  question_ids: z
    .array(z.string())
    .describe("Array of question IDs in the new desired order"),
};
