import type { SubmissionHistoryItem } from "../types"

type BadgeVariant = "default" | "secondary" | "destructive" | "outline"

export function scoreBadgeVariant(awarded: number, max: number): BadgeVariant {
	if (max === 0) return "outline"
	const pct = (awarded / max) * 100
	if (pct >= 70) return "default"
	if (pct >= 40) return "secondary"
	return "destructive"
}

export function statusBadgeVariant(status: string): BadgeVariant {
	switch (status) {
		case "ocr_complete":
			return "secondary"
		case "processing":
			return "default"
		case "failed":
			return "destructive"
		default:
			return "outline"
	}
}

// Standalone submission view — only requires submission-level access, so users
// who were shared a single submission (not the parent paper) can open it
// without hitting the paper-level access gate.
export function submissionHref(sub: SubmissionHistoryItem): string {
	return `/teacher/submissions/${sub.id}`
}
