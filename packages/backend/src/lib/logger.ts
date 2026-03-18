type Level = "info" | "warn" | "error"

function emit(
	level: Level,
	tag: string,
	message: string,
	data?: Record<string, unknown>,
) {
	const entry = {
		level,
		tag,
		message,
		timestamp: new Date().toISOString(),
		...(data ?? {}),
	}
	const line = JSON.stringify(entry)
	if (level === "error") console.error(line)
	else if (level === "warn") console.warn(line)
	else console.log(line)
}

export const logger = {
	info: (tag: string, message: string, data?: Record<string, unknown>) =>
		emit("info", tag, message, data),
	warn: (tag: string, message: string, data?: Record<string, unknown>) =>
		emit("warn", tag, message, data),
	error: (tag: string, message: string, data?: Record<string, unknown>) =>
		emit("error", tag, message, data),
}
