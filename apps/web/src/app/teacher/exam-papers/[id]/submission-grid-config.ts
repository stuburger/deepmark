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
			chip: "bg-success-50 text-success-800 dark:bg-success-900/40 dark:text-success-300",
			dot: "bg-success",
		}
	if (pct >= 40)
		return {
			chip: "bg-warning-50 text-warning-800 dark:bg-warning-900/40 dark:text-warning-300",
			dot: "bg-warning",
		}
	return {
		chip: "bg-error-50 text-error-700 dark:bg-error-900/40 dark:text-error-300",
		dot: "bg-destructive",
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
			return "bg-destructive"
		case "ocr_complete":
			return "bg-success"
		default:
			return "bg-warning-400"
	}
}

export function statusLabel(status: string) {
	return status.replace(/_/g, " ")
}
