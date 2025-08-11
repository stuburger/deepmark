import type { ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js"
import type {
	CallToolResult,
	ServerNotification,
	ServerRequest,
} from "@modelcontextprotocol/sdk/types.js"
import type { z } from "zod"

export const text = <T extends Record<string, unknown>>(
	text: string,
	structuredData?: T,
): CallToolResult => ({
	content: [{ text, type: "text" }],
	structuredContent: structuredData,
})

export const error = <T extends Record<string, unknown>>(
	message: string,
	errorData?: T,
): CallToolResult => ({
	content: [{ text: message, type: "text" }],
	structuredContent: errorData,
	isError: true,
})

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
		extra: { authInfo: { extra: { userId: string } } },
	) => Promise<string>,
): ToolCallback<T> => {
	// @ts-expect-error todo
	const callback: ToolCallback<T> = async (args, extra) => {
		try {
			const userId = extra.authInfo?.extra?.userId as string | undefined
			if (!userId) {
				throw new Error("Not authenticated")
			}

			// @ts-expect-error todo
			const content = await handler(args, {
				authInfo: { extra: { userId } },
			})

			return text(content)
		} catch (err) {
			return error(
				`Tool execution failed: ${
					err instanceof Error ? err.message : "Unknown error"
				}`,
				{
					error_type: err instanceof Error ? err.constructor.name : "Unknown",
					timestamp: new Date().toISOString(),
				},
			)
		}
	}

	return callback
}
