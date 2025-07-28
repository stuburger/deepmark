import { z } from "zod";

export const GetExamPaperByIdSchema = {
  exam_paper_id: z.string().describe("The ID of the exam paper to retrieve"),
};
