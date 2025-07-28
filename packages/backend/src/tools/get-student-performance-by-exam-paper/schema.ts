import { z } from "zod";

export const GetStudentPerformanceByExamPaperSchema = {
  exam_paper_id: z.string().describe("The ID of the exam paper to analyze"),
  student_id: z.string().describe("The ID of the student to analyze"),
  include_answer_details: z
    .boolean()
    .optional()
    .default(false)
    .describe("Whether to include detailed answer analysis"),
};
