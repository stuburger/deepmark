import { db } from "@/db"
import { CreateQuestionSchema } from "./schema"
import { tool } from "@/tools/shared/tool-utils"
import { service } from "./service"

export const handler = tool(CreateQuestionSchema, async (args, extra) => {
	const userId = extra.authInfo.extra.userId
	return await service(args, userId)
})
