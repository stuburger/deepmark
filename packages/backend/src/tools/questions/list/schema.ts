import { SUBJECT_VALUES } from "@mcp-gcse/db"
import { z } from "zod"

export const ListQuestionsSchema = {
	subject: z.enum(SUBJECT_VALUES).optional(),
}
