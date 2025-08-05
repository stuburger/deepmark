import { DebugToolSchema } from "./schema"

import { tool } from "../../shared/tool-utils"

export const handler = tool(DebugToolSchema, async (args, extra) => {
	console.log(extra)
	return JSON.stringify(extra)
})
