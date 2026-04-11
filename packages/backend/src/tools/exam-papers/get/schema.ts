import { z } from "zod/v4"

export const GetExamPaperByIdSchema = {
	exam_paper_id: z.string().describe("The ID of the exam paper to retrieve"),
}
