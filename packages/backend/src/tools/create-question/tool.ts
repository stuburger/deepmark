import { type ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CreateQuestionSchema } from "./schema";

export const handler: ToolCallback<typeof CreateQuestionSchema> = async (
  args
) => {
  return { content: [{ type: "text", text: `` }] };
};
