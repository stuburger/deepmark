import { createSubjects } from "@openauthjs/openauth/subject"
import { nullable, object, string } from "valibot"

export const subjects = createSubjects({
	user: object({
		userId: string(),
		email: nullable(string()),
	}),
})
