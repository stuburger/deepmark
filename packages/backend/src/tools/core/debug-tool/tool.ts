import { DebugToolSchema } from "./schema"

import { tool } from "@/tools/shared/tool-utils"

export const handler = tool(DebugToolSchema, async (args, extra) => {
	console.log(extra)
	return JSON.stringify(extra)
})
