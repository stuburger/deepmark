export const TERMINAL_STATUSES = new Set([
	"ocr_complete",
	"failed",
	"cancelled",
])

export function formatDate(date: Date) {
	return new Intl.DateTimeFormat("en-GB", {
		day: "2-digit",
		month: "short",
		year: "numeric",
	}).format(new Date(date))
}

export function scoreColour(pct: number | null) {
	if (pct === null) return null
	if (pct >= 70)
		return {
			chip: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
			dot: "bg-green-500",
		}
	if (pct >= 40)
		return {
			chip: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
			dot: "bg-amber-500",
		}
	return {
		chip: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
		dot: "bg-red-500",
	}
}

export function statusDot(status: string, pct: number | null) {
	if (pct !== null) {
		const c = scoreColour(pct)
		return c?.dot ?? "bg-muted-foreground"
	}
	switch (status) {
		case "failed":
		case "cancelled":
			return "bg-red-500"
		case "ocr_complete":
			return "bg-green-500"
		default:
			return "bg-amber-400"
	}
}

export function statusLabel(status: string) {
	return status.replace(/_/g, " ")
}
