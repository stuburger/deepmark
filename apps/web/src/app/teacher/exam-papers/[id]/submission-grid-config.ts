import type { SoftChipKind } from "@/components/ui/soft-chip"
import type { StatusDotKind } from "@/components/ui/status-dot"

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

/**
 * Pick a SoftChip kind for a marked submission's percentage. Used by the
 * score cell once the submission reaches `ocr_complete` and a real score
 * is available.
 */
export function scoreChipKind(pct: number): SoftChipKind {
	if (pct >= 70) return "success"
	if (pct >= 40) return "warning"
	return "error"
}

// ─── Submission phase (UI-facing rollup of ScanStatus) ──────────────────────

export type SubmissionPhase = "extraction" | "grading" | "done" | "error"

/**
 * Roll up the legacy ScanStatus into the four phases the UI cares about.
 * `pending` and `processing` are OCR-side; `text_extracted` and `grading`
 * are grading-side; `ocr_complete` is the terminal happy path.
 */
export function submissionPhase(status: string): SubmissionPhase {
	switch (status) {
		case "failed":
		case "cancelled":
			return "error"
		case "ocr_complete":
			return "done"
		case "text_extracted":
		case "grading":
			return "grading"
		default:
			// pending, processing, anything new/unknown → still working
			return "extraction"
	}
}

export const PHASE_LABEL: Record<SubmissionPhase, string> = {
	extraction: "Extracting",
	grading: "Grading",
	done: "Marked",
	error: "Failed",
}

export function phaseStatusKind(phase: SubmissionPhase): StatusDotKind {
	switch (phase) {
		case "extraction":
			return "warning"
		case "grading":
			return "info"
		case "done":
			return "success"
		case "error":
			return "error"
	}
}

export function isInFlightPhase(phase: SubmissionPhase): boolean {
	return phase === "extraction" || phase === "grading"
}
