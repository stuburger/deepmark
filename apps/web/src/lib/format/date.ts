// Canonical en-GB date formatters. Use these everywhere instead of inlining
// `new Intl.DateTimeFormat(...)` — keeps locale and shape consistent and gives
// us one place to tweak if a design or i18n change lands.

/** `dd MMM yyyy` — short month, no time. The default list/card date. */
export function formatDate(date: Date | string): string {
	return new Intl.DateTimeFormat("en-GB", {
		day: "2-digit",
		month: "short",
		year: "numeric",
	}).format(new Date(date))
}

/** `dd MMM yyyy, HH:mm` — short month with time. For "Submitted" / activity columns. */
export function formatDateTime(date: Date | string): string {
	return new Intl.DateTimeFormat("en-GB", {
		day: "2-digit",
		month: "short",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	}).format(new Date(date))
}

/** `dd MMMM yyyy` — full month, no time. For prose / printed surfaces. */
export function formatDateLong(date: Date | string): string {
	return new Intl.DateTimeFormat("en-GB", {
		day: "2-digit",
		month: "long",
		year: "numeric",
	}).format(new Date(date))
}

/**
 * `42s` or `2m 17s` — short elapsed-since string for live progress panels
 * ("started 1m 30s ago"). Floors to seconds; no decimals.
 */
export function formatElapsedShort(start: Date | string): string {
	const startMs = new Date(start).getTime()
	const seconds = Math.max(0, Math.round((Date.now() - startMs) / 1000))
	if (seconds < 60) return `${seconds}s`
	const mins = Math.floor(seconds / 60)
	const rem = seconds % 60
	return `${mins}m ${rem}s`
}
