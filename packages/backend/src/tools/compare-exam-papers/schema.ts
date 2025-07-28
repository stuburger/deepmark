import { z } from "zod";

export const CompareExamPapersSchema = {
  exam_paper_ids: z
    .array(z.string())
    .min(2)
    .max(5)
    .describe("Array of exam paper IDs to compare (2-5 papers)"),
  comparison_metrics: z
    .array(
      z.enum([
        "scores",
        "completion_times",
        "difficulty",
        "section_performance",
      ])
    )
    .optional()
    .default(["scores", "completion_times"])
    .describe("Which metrics to include in the comparison"),
};
