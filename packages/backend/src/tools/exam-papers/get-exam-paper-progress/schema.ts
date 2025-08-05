import { z } from "zod";

export const GetExamPaperProgressSchema = {
  exam_paper_id: z
    .string()
    .describe("The ID of the exam paper to get progress for"),
  student_id: z.string().describe("The ID of the student to get progress for"),
};
