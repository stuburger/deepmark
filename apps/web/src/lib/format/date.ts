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
