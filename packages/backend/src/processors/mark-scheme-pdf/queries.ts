import { db } from "@/db"
import type { ExistingQuestionContext } from "./prompts"

export function embeddingToVectorStr(vec: number[]): string {
	return `[${vec.join(",")}]`
}

/**
 * Fetches existing questions for the exam paper (or recent question_paper uploads
 * for the exam_board when no paper is linked) so Gemini can map mark scheme entries
 * directly to existing questions rather than creating duplicates.
 */
export async function fetchExistingQuestionsForJob(
	examPaperId: string | null,
	examBoard: string,
): Promise<ExistingQuestionContext[]> {
	if (examPaperId) {
		return db.$queryRaw<ExistingQuestionContext[]>`
			SELECT q.id, q.question_number, q.text, q.question_type
			FROM questions q
			JOIN exam_section_questions esq ON esq.question_id = q.id
			JOIN exam_sections es ON es.id = esq.exam_section_id
			WHERE es.exam_paper_id = ${examPaperId}
			ORDER BY esq.order
		`
	}
	return db.$queryRaw<ExistingQuestionContext[]>`
		SELECT DISTINCT ON (q.question_number) q.id, q.question_number, q.text, q.question_type
		FROM questions q
		JOIN pdf_ingestion_jobs pij ON q.source_pdf_ingestion_job_id = pij.id
		WHERE pij.exam_board = ${examBoard}
		AND q.origin = 'question_paper'
		ORDER BY q.question_number, pij.created_at DESC
		LIMIT 60
	`
}

/**
 * Finds a matching question in the given exam paper using two strategies:
 *
 * 1. Exact question-number match (scoped to the paper) — most reliable.
 * 2. Embedding cosine similarity (scoped to the paper, threshold < 0.2).
 *
 * Falls back to exam_board scope only when no examPaperId is provided
 * (standalone uploads not linked to a paper).
 */
export async function findMatchingQuestionId(
	examPaperId: string | null,
	examBoard: string,
	questionNumber: string | null,
	embeddingVec: number[],
): Promise<string | null> {
	// Strategy 1: exact question number match within the paper
	if (examPaperId && questionNumber) {
		const rows = await db.$queryRaw<{ id: string }[]>`
			SELECT q.id FROM questions q
			JOIN exam_section_questions esq ON esq.question_id = q.id
			JOIN exam_sections es ON es.id = esq.exam_section_id
			WHERE es.exam_paper_id = ${examPaperId}
			AND q.question_number = ${questionNumber}
			LIMIT 1
		`
		if (rows[0]) {
			return rows[0].id
		}
	}

	// Strategy 2: embedding similarity scoped to the paper (or exam_board fallback)
	const vecStr = embeddingToVectorStr(embeddingVec)

	let rows: { id: string }[]
	if (examPaperId) {
		rows = await db.$queryRaw<{ id: string }[]>`
			SELECT q.id FROM questions q
			JOIN exam_section_questions esq ON esq.question_id = q.id
			JOIN exam_sections es ON es.id = esq.exam_section_id
			WHERE es.exam_paper_id = ${examPaperId}
			AND q.embedding IS NOT NULL
			ORDER BY q.embedding <=> (${vecStr}::text)::vector
			LIMIT 1
		`
	} else {
		rows = await db.$queryRaw<{ id: string }[]>`
			SELECT q.id FROM questions q
			JOIN pdf_ingestion_jobs pij ON q.source_pdf_ingestion_job_id = pij.id
			WHERE pij.exam_board = ${examBoard}
			AND q.embedding IS NOT NULL
			ORDER BY q.embedding <=> (${vecStr}::text)::vector
			LIMIT 1
		`
	}

	const row = rows[0]
	if (!row) return null

	const withDistance = await db.$queryRaw<{ id: string; dist: number }[]>`
		SELECT q.id, (q.embedding <=> (${vecStr}::text)::vector) as dist
		FROM questions q
		WHERE q.id = ${row.id}
	`
	const d = withDistance[0]?.dist
	if (d == null || Number(d) >= 0.2) return null
	return row.id
}
