"use server"

import { db } from "@/lib/db"
import { auth } from "../auth"

// ─── getPdfIngestionJobStatus ───────────────────────────────────────────────

export type GetPdfIngestionJobStatusResult =
	| {
			ok: true
			status: string
			error: string | null
			detected_exam_paper_metadata: unknown
			auto_create_exam_paper: boolean
	  }
	| { ok: false; error: string }

export async function getPdfIngestionJobStatus(
	jobId: string,
): Promise<GetPdfIngestionJobStatusResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }
	const job = await db.pdfIngestionJob.findFirst({
		where: { id: jobId },
	})
	if (!job) return { ok: false, error: "Job not found" }
	return {
		ok: true,
		status: job.status,
		error: job.error,
		detected_exam_paper_metadata: job.detected_exam_paper_metadata,
		auto_create_exam_paper: job.auto_create_exam_paper,
	}
}
