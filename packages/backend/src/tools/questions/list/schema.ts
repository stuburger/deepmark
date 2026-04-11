import { SUBJECT_VALUES } from "@mcp-gcse/db"
import { z } from "zod/v4"

export const ListQuestionsSchema = {
	subject: z.enum(SUBJECT_VALUES).optional(),
}
