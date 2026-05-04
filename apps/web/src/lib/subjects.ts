// Client-safe subject constants — do NOT import from @mcp-gcse/db in client components,
// as that pulls in the Prisma client (Node.js-only) into the browser bundle.

export type Subject =
	| "biology"
	| "chemistry"
	| "physics"
	| "english"
	| "english_literature"
	| "mathematics"
	| "history"
	| "geography"
	| "computer_science"
	| "french"
	| "spanish"
	| "religious_studies"
	| "business"

export const SUBJECT_LABELS: Record<Subject, string> = {
	biology: "Biology",
	chemistry: "Chemistry",
	physics: "Physics",
	english: "English Language",
	english_literature: "English Literature",
	mathematics: "Mathematics",
	history: "History",
	geography: "Geography",
	computer_science: "Computer Science",
	french: "French",
	spanish: "Spanish",
	religious_studies: "Religious Studies",
	business: "Business Studies",
}

export const SUBJECT_VALUES = Object.keys(SUBJECT_LABELS) as Subject[]

export const SUBJECTS: { value: Subject; label: string }[] = SUBJECT_VALUES.map(
	(value) => ({ value, label: SUBJECT_LABELS[value] }),
)

export const EXAM_BOARDS = [
	"AQA",
	"OCR",
	"Edexcel",
	"WJEC",
	"Cambridge",
	"Other",
] as const

// Subject palette — one distinct hue per subject so cards read at a glance.
// This is a domain palette (like ao-palette), intentionally wider than the
// brand scales. Lives in this file so the lint allowlist can target it; do
// not extend the rainbow into product UI for non-subject signals.
const SUBJECT_COLOURS: Record<Subject, string> = {
	biology: "bg-green-500",
	chemistry: "bg-orange-500",
	physics: "bg-blue-500",
	english: "bg-rose-500",
	english_literature: "bg-pink-500",
	mathematics: "bg-violet-500",
	history: "bg-amber-600",
	geography: "bg-teal-500",
	computer_science: "bg-cyan-500",
	french: "bg-indigo-500",
	spanish: "bg-yellow-500",
	religious_studies: "bg-purple-500",
	business: "bg-slate-500",
}

export function subjectColour(subject: string): string {
	return SUBJECT_COLOURS[subject as Subject] ?? "bg-muted-foreground"
}
