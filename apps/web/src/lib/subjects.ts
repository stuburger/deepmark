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
