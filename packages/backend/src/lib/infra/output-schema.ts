import { Output } from "ai"
import type { z } from "zod/v4"

/**
 * Typed wrapper for `Output.object` — works around a zod v4 / AI SDK type
 * mismatch where `ZodObject` is not assignable to `FlexibleSchema`.
 *
 * @see https://github.com/vercel/ai/issues/7160
 *
 * Remove once `@ai-sdk/provider-utils` ships a stable fix.
 */
// biome-ignore lint/suspicious/noExplicitAny: upstream type mismatch requires cast
export function outputSchema<T>(
	schema: z.ZodType<T>,
): ReturnType<typeof Output.object<T>> {
	// @ts-ignore — zod v4 / AI SDK type drift. Tolerant of either resolution:
	// some lockfile snapshots produce a type error here, others don't. Using
	// @ts-ignore (not @ts-expect-error) so a clean resolution doesn't fail CI.
	return Output.object({ schema: schema })
}
