import { z } from "zod";

export const ListExamSessionsSchema = {
  exam_paper_id: z.string().optional().describe("Filter by exam paper ID"),
  student_id: z.string().optional().describe("Filter by student ID"),
  status: z
    .enum(["in_progress", "completed", "abandoned"])
    .optional()
    .describe("Filter by session status"),
  limit: z
    .number()
    .int()
    .positive()
    .optional()
    .default(50)
    .describe("Maximum number of sessions to return"),
  skip: z
    .number()
    .int()
    .min(0)
    .optional()
    .default(0)
    .describe("Number of sessions to skip for pagination"),
};
