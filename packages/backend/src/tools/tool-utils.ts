import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

export const text = <T extends Record<string, unknown>>(
  text: string,
  structuredData?: T
): CallToolResult => ({
  content: [{ text, type: "text" }],
  structuredContent: structuredData,
});

export const error = <T extends Record<string, unknown>>(
  message: string,
  errorData?: T
): CallToolResult => ({
  content: [{ text: message, type: "text" }],
  structuredContent: errorData,
  isError: true,
});

/**
 * Higher-order function that wraps a tool handler with standardized logging and error handling.
 *
 * @example
 * ```typescript
 * // Instead of:
 * export const handler: ToolCallback<typeof MySchema> = async (args, extra) => {
 *   console.log("[my-tool] Handler invoked", args);
 *   try {
 *     // ... tool logic
 *     return text("Success!");
 *   } catch (err) {
 *     console.error("[my-tool] Handler failed:", err);
 *     return error("Failed: " + err.message);
 *   }
 * };
 *
 * // You can now use:
 * export const handler = tool(MySchema, async (args, extra) => {
 *   // ... tool logic
 *   return text("Success!");
 * });
 * ```
 */
export const tool = <T extends z.ZodRawShape>(
  schema: T,
  handler: (
    args: z.infer<z.ZodObject<T>>,
    extra?: any
  ) => Promise<CallToolResult> | CallToolResult
) => {
  return async (args: z.infer<z.ZodObject<T>>, extra?: any) => {
    try {
      const result = await handler(args, extra);

      return result;
    } catch (err) {
      return error(
        `Tool execution failed: ${
          err instanceof Error ? err.message : "Unknown error"
        }`,
        {
          error_type: err instanceof Error ? err.constructor.name : "Unknown",
          timestamp: new Date().toISOString(),
        }
      );
    }
  };
};
