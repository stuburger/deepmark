import { type ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ListQuestionsSchema } from "./schema";

export const handler: ToolCallback<typeof ListQuestionsSchema> = async (
  args
) => {
  return { content: [{ type: "text", text: `` }] };
};
