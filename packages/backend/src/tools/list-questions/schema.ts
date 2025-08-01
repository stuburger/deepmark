import { z } from "zod"

export const ListQuestionsSchema = {
	subject: z.enum(["biology", "chemistry", "physics", "english"]).optional(),
}
