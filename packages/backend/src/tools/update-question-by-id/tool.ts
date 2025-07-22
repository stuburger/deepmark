// import { ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol";
import { UpdateQuestionByIdSchema } from "./schema";
import z, { ZodRawShape, type ZodTypeAny } from "zod";
import {
  CallToolResult,
  ServerNotification,
  ServerRequest,
} from "@modelcontextprotocol/sdk/types";

type ToolCallback<Args extends ZodRawShape> = (
  args: z.objectOutputType<Args, ZodTypeAny>,
  extra: RequestHandlerExtra<ServerRequest, ServerNotification>
) => CallToolResult | Promise<CallToolResult>;

export const handler: ToolCallback<typeof UpdateQuestionByIdSchema> = async (
  args
) => {
  return { content: [{ type: "text", text: `` }] };
};
