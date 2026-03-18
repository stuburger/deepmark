import type { Subject } from "./generated/prisma/client"

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

export const SUBJECT_VALUES = Object.keys(SUBJECT_LABELS) as [
	Subject,
	...Subject[],
]

export const SUBJECTS: { value: Subject; label: string }[] = SUBJECT_VALUES.map(
	(value) => ({ value, label: SUBJECT_LABELS[value] }),
)
