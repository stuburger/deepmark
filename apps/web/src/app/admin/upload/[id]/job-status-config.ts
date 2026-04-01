export const STATUS_CONFIG: Record<
	string,
	{
		label: string
		progress: number
		variant: "default" | "secondary" | "destructive" | "outline"
	}
> = {
	pending: { label: "Queued", progress: 10, variant: "outline" },
	processing: { label: "Processing PDF", progress: 45, variant: "default" },
	extracting: { label: "Extracting data", progress: 75, variant: "default" },
	extracted: { label: "Finalising", progress: 90, variant: "default" },
	ocr_complete: { label: "Complete", progress: 100, variant: "secondary" },
	failed: { label: "Failed", progress: 0, variant: "destructive" },
}

export function statusConfig(status: string) {
	return STATUS_CONFIG[status] ?? STATUS_CONFIG.pending
}

export const TERMINAL = new Set(["ocr_complete", "failed"])

export function docTypeLabel(type: string) {
	switch (type) {
		case "mark_scheme":
			return "Mark scheme"
		case "question_paper":
			return "Question paper"
		case "exemplar":
			return "Exemplar memo"
		case "student_paper":
			return "Student paper"
		default:
			return type
	}
}

export function capitalize(s: string) {
	return s.charAt(0).toUpperCase() + s.slice(1)
}

export function formatDate(d: Date) {
	return new Intl.DateTimeFormat("en-GB", {
		day: "2-digit",
		month: "short",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	}).format(new Date(d))
}
