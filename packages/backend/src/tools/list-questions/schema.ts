import { z } from "zod";

export const ListQuestionsSchema = { subject: z.string().optional() }
