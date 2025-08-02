import { z } from "zod"

export const GetMarkResultByAnswerIdSchema = {
	answer_id: z
		.string()
		.describe(
			"The unique identifier for the answer to retrieve the marking result for",
		),
}
