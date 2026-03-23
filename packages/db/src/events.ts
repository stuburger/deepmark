import { Prisma, type PrismaClient } from "./generated/prisma/client"

// ─── Event types ──────────────────────────────────────────────────────────────

export type JobEvent =
	| { type: "ocr_started"; at: string }
	| {
			type: "answers_extracted"
			at: string
			count: number
			student_name: string | null
	  }
	| { type: "ocr_complete"; at: string }
	| { type: "student_linked"; at: string; student_name: string }
	| { type: "exam_paper_selected"; at: string; title: string }
	| { type: "grading_started"; at: string; questions_total: number }
	| { type: "region_attribution_started"; at: string }
	| {
			type: "question_graded"
			at: string
			question_number: string
			awarded: number
			max: number
	  }
	| {
			type: "region_attribution_complete"
			at: string
			questions_located: number
	  }
	| {
			type: "grading_complete"
			at: string
			total_awarded: number
			total_max: number
	  }
	| { type: "job_failed"; at: string; phase: "ocr" | "grading"; error: string }

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Atomically appends one event to the job_events JSONB array on pdf_ingestion_jobs.
 * Uses Postgres || operator — no read-modify-write race.
 * Non-fatal: swallows all errors so the main pipeline is never affected.
 */
export async function logEvent(
	db: PrismaClient,
	jobId: string,
	event: JobEvent,
): Promise<void> {
	try {
		const payload = JSON.stringify([event])
		await db.$executeRaw(Prisma.sql`
      UPDATE "pdf_ingestion_jobs"
      SET job_events = COALESCE(job_events, '[]'::jsonb) || ${payload}::jsonb
      WHERE id = ${jobId}
    `)
	} catch {
		// Event loss is acceptable — pipeline correctness must not depend on this.
	}
}

/**
 * Atomically appends one event to the job_events JSONB array on student_paper_jobs.
 * Uses Postgres || operator — no read-modify-write race.
 * Non-fatal: swallows all errors so the main pipeline is never affected.
 */
export async function logStudentPaperEvent(
	db: PrismaClient,
	jobId: string,
	event: JobEvent,
): Promise<void> {
	try {
		const payload = JSON.stringify([event])
		await db.$executeRaw(Prisma.sql`
      UPDATE "student_paper_jobs"
      SET job_events = COALESCE(job_events, '[]'::jsonb) || ${payload}::jsonb
      WHERE id = ${jobId}
    `)
	} catch {
		// Event loss is acceptable — pipeline correctness must not depend on this.
	}
}
