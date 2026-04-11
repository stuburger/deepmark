import { z } from "zod/v4"

export const GetQuestionByIdSchema = {
	id: z.string().describe("The unique identifier for the question to retrieve"),
}
