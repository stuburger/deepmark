"use server"

import { resourceAction } from "@/lib/authz"
import { db } from "@/lib/db"
import { z } from "zod"

export const getPdfIngestionJobStatus = resourceAction({
	type: "pdfIngestionJob",
	role: "viewer",
	schema: z.object({ jobId: z.string() }),
	id: ({ jobId }) => jobId,
}).action(
	async ({
		parsedInput: { jobId },
	}): Promise<{
		status: string
		error: string | null
		detected_exam_paper_metadata: unknown
		auto_create_exam_paper: boolean
	} | null> => {
		const job = await db.pdfIngestionJob.findFirst({
			where: { id: jobId },
		})
		if (!job) return null
		return {
			status: job.status,
			error: job.error,
			detected_exam_paper_metadata: job.detected_exam_paper_metadata,
			auto_create_exam_paper: job.auto_create_exam_paper,
		}
	},
)
