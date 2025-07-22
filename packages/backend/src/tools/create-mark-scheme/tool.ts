import { type ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CreateMarkSchemeSchema } from "./schema";

export const handler: ToolCallback<typeof CreateMarkSchemeSchema> = async (
  args
) => {
  return { content: [{ type: "text", text: `` }] };
};
