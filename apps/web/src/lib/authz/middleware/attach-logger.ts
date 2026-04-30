import { log as baseLog } from "@/lib/logger"

export type Logger = {
	info: (message: string, data?: Record<string, unknown>) => void
	warn: (message: string, data?: Record<string, unknown>) => void
	error: (message: string, data?: Record<string, unknown>) => void
}

/**
 * Returns a logger pre-bound with `userId` and a tag derived from the action's
 * source location. Callers in action handlers say `ctx.log.info("foo", {...})`
 * without ever needing to remember to include the user id.
 */
export function buildLogger(tag: string, userId: string): Logger {
	const inject = (data?: Record<string, unknown>) => ({
		userId,
		...(data ?? {}),
	})
	return {
		info: (message, data) => baseLog.info(tag, message, inject(data)),
		warn: (message, data) => baseLog.warn(tag, message, inject(data)),
		error: (message, data) => baseLog.error(tag, message, inject(data)),
	}
}
