import { z } from "zod";

export const GetExamPaperStatisticsSchema = {
  exam_paper_id: z
    .string()
    .describe("The ID of the exam paper to get statistics for"),
  include_detailed_breakdown: z
    .boolean()
    .optional()
    .default(false)
    .describe("Whether to include detailed breakdown by section"),
};
