import { db } from "@/db"
import type { QuestionSeed } from "@/lib/types"
import { logger } from "@/lib/infra/logger"
import type { Subject } from "@mcp-gcse/db"

const TAG = "student-paper/question-seeds"

export const SUBJECT_VALUES = [
	"biology",
	"chemistry",
	"physics",
	"english",
	"english_literature",
	"mathematics",
	"history",
	"geography",
	"computer_science",
	"french",
	"spanish",
	"religious_studies",
	"business",
] as const

export type PageEntry = {
	key: string
	order: number
	mime_type: string
}

export function isValidSubject(s: string): s is Subject {
	return (SUBJECT_VALUES as readonly string[]).includes(s)
}

/**
 * Validates and narrows the raw JSON pages field from a StudentPaperJob row.
 * Throws if the value is null, not an array, or contains entries with the
 * wrong shape — a malformed pages field is a data integrity error, not a
 * recoverable condition.
 */
export function parsePages(raw: unknown): PageEntry[] {
	if (!Array.isArray(raw)) {
		throw new Error(`job.pages is not an array (got ${typeof raw})`)
	}
	return raw.map((p: unknown, i: number) => {
		if (
			typeof p !== "object" ||
			p === null ||
			typeof (p as Record<string, unknown>).key !== "string" ||
			typeof (p as Record<string, unknown>).order !== "number" ||
			typeof (p as Record<string, unknown>).mime_type !== "string"
		) {
			throw new Error(
				`job.pages[${i}] has unexpected shape: ${JSON.stringify(p)}`,
			)
		}
		return p as PageEntry
	})
}

/**
 * Fetches the minimal question data needed for seeded extraction — just the
 * id, canonical number, text, and type for each question on the paper.
 * Does not load mark schemes or other heavyweight relations.
 */
export async function loadQuestionSeeds(
	examPaperId: string,
): Promise<QuestionSeed[]> {
	const sections = await db.examSection.findMany({
		where: { exam_paper_id: examPaperId },
		orderBy: { order: "asc" },
		include: {
			exam_section_questions: {
				orderBy: { order: "asc" },
				include: {
					question: {
						select: {
							id: true,
							question_number: true,
							text: true,
							question_type: true,
						},
					},
				},
			},
		},
	})

	const seeds: QuestionSeed[] = []
	for (const section of sections) {
		for (const esq of section.exam_section_questions) {
			const questionNumber = esq.question.question_number
			if (!questionNumber) {
				const fallback = String(seeds.length + 1)
				logger.warn(
					TAG,
					"Question has no question_number — using positional fallback",
					{
						question_id: esq.question.id,
						exam_paper_id: examPaperId,
						fallback_number: fallback,
					},
				)
				seeds.push({
					question_id: esq.question.id,
					question_number: fallback,
					question_text: esq.question.text,
					question_type: esq.question.question_type,
				})
				continue
			}
			seeds.push({
				question_id: esq.question.id,
				question_number: questionNumber,
				question_text: esq.question.text,
				question_type: esq.question.question_type,
			})
		}
	}
	return seeds
}
