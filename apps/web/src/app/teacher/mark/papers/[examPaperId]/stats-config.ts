export const TERMINAL_STATUSES = new Set([
	"ocr_complete",
	"failed",
	"cancelled",
])

export const GRADE_BANDS = [
	{ label: "0–20%", min: 0, max: 20 },
	{ label: "20–40%", min: 20, max: 40 },
	{ label: "40–60%", min: 40, max: 60 },
	{ label: "60–80%", min: 60, max: 80 },
	{ label: "80–100%", min: 80, max: 101 },
]

export const BAND_COLORS = [
	"#ef4444",
	"#f97316",
	"#eab308",
	"#22c55e",
	"#16a34a",
]

export function scoreBadgeVariant(
	pct: number,
): "default" | "secondary" | "destructive" | "outline" {
	if (pct >= 70) return "default"
	if (pct >= 40) return "secondary"
	return "destructive"
}

export function statusLabel(status: string) {
	switch (status) {
		case "pending":
			return "Queued"
		case "processing":
			return "Reading pages…"
		case "extracting":
		case "extracted":
			return "Extracting text…"
		case "grading":
			return "Marking…"
		case "ocr_complete":
			return null
		case "failed":
			return "Failed"
		case "cancelled":
			return "Cancelled"
		default:
			return "Processing…"
	}
}
