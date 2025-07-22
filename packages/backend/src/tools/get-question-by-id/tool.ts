import { type ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GetQuestionByIdSchema } from "./schema";

export const handler: ToolCallback<typeof GetQuestionByIdSchema> = async (
  args
) => {
  return { content: [{ type: "text", text: `` }] };
};
