import { ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { UpdateMarkSchemeSchema } from "./schema";

export const handler: ToolCallback<typeof UpdateMarkSchemeSchema> = async (
  args
) => {
  return { content: [{ type: "text", text: `` }] };
};
