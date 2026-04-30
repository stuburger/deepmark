"use server"

import { resourceAction, resourcesAction } from "@/lib/authz"
import { db } from "@/lib/db"
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs"
import {
	ResourceGrantPrincipalType,
	ResourceGrantResourceType,
	ResourceGrantRole,
} from "@mcp-gcse/db"
import { Resource } from "sst"
import { z } from "zod"

const sqs = new SQSClient({})

/**
 * Sets the exam paper on the submission and enqueues it for grading. Requires
 * OCR to have completed first.
 */
export const triggerGrading = resourcesAction({
	schema: z.object({ jobId: z.string(), examPaperId: z.string() }),
	resources: [
		{ type: "submission", role: "editor", id: ({ jobId }) => jobId },
		{ type: "examPaper", role: "viewer", id: ({ examPaperId }) => examPaperId },
	],
}).action(
	async ({
		parsedInput: { jobId, examPaperId },
		ctx,
	}): Promise<{ ok: true }> => {
		const sub = await db.studentSubmission.findFirst({
			where: { id: jobId },
			include: {
				ocr_runs: {
					orderBy: { created_at: "desc" },
					take: 1,
					select: { extracted_answers_raw: true },
				},
			},
		})
		if (!sub) throw new Error("Job not found")
		if (!sub.ocr_runs[0]?.extracted_answers_raw) {
			throw new Error("OCR must complete before marking")
		}

		const examPaper = await db.examPaper.findFirst({
			where: { id: examPaperId, is_active: true },
			select: {
				id: true,
				title: true,
				exam_board: true,
				subject: true,
				year: true,
			},
		})
		if (!examPaper) throw new Error("Exam paper not found")

		await db.studentSubmission.update({
			where: { id: jobId },
			data: {
				exam_paper_id: examPaperId,
				exam_board: examPaper.exam_board ?? "Unknown",
				subject: examPaper.subject,
				year: examPaper.year,
			},
		})

		await sqs.send(
			new SendMessageCommand({
				QueueUrl: Resource.StudentPaperQueue.url,
				MessageBody: JSON.stringify({ job_id: jobId }),
			}),
		)

		ctx.log.info("Grading triggered", { jobId, examPaperId })
		return { ok: true }
	},
)

/**
 * Creates a new submission from the same OCR data, then marks the old one as
 * superseded. Submissions are immutable — re-marking always produces a new
 * record so the original result is preserved as history.
 */
export const retriggerGrading = resourceAction({
	type: "submission",
	role: "editor",
	schema: z.object({ jobId: z.string() }),
	id: ({ jobId }) => jobId,
}).action(
	async ({ parsedInput: { jobId }, ctx }): Promise<{ newJobId: string }> => {
		const oldSub = await db.studentSubmission.findFirst({
			where: { id: jobId },
			include: {
				ocr_runs: {
					orderBy: { created_at: "desc" },
					take: 1,
					select: {
						extracted_answers_raw: true,
						page_analyses: true,
						vision_raw_s3_key: true,
					},
				},
			},
		})
		if (!oldSub) throw new Error("Job not found")

		const latestOcr = oldSub.ocr_runs[0]
		if (!latestOcr?.extracted_answers_raw) {
			throw new Error("No extracted answers — run OCR first")
		}

		const newSub = await db.$transaction(async (tx) => {
			const created = await tx.studentSubmission.create({
				data: {
					s3_key: oldSub.s3_key,
					s3_bucket: oldSub.s3_bucket,
					uploaded_by: oldSub.uploaded_by,
					exam_paper_id: oldSub.exam_paper_id,
					exam_board: oldSub.exam_board,
					subject: oldSub.subject,
					year: oldSub.year,
					pages: oldSub.pages as never,
					student_name: oldSub.student_name,
					student_id: oldSub.student_id,
					batch_job_id: oldSub.batch_job_id,
					staged_script_id: oldSub.staged_script_id,
				},
			})
			await tx.resourceGrant.create({
				data: {
					resource_type: ResourceGrantResourceType.student_submission,
					resource_id: created.id,
					principal_type: ResourceGrantPrincipalType.user,
					principal_user_id: oldSub.uploaded_by,
					role: ResourceGrantRole.owner,
					created_by: oldSub.uploaded_by,
					accepted_at: new Date(),
				},
			})

			await tx.ocrRun.create({
				data: {
					id: created.id,
					submission_id: created.id,
					status: "complete",
					extracted_answers_raw: latestOcr.extracted_answers_raw as never,
					page_analyses: latestOcr.page_analyses as never,
					vision_raw_s3_key: latestOcr.vision_raw_s3_key,
				},
			})

			const oldTokens = await tx.studentPaperPageToken.findMany({
				where: { submission_id: jobId },
			})

			if (oldTokens.length > 0) {
				await tx.studentPaperPageToken.createMany({
					data: oldTokens.map((t) => ({
						submission_id: created.id,
						page_order: t.page_order,
						para_index: t.para_index,
						line_index: t.line_index,
						word_index: t.word_index,
						text_raw: t.text_raw,
						text_corrected: t.text_corrected,
						bbox: t.bbox as never,
						confidence: t.confidence,
						question_id: t.question_id,
					})),
				})
			}

			const oldRegions = await tx.studentPaperAnswerRegion.findMany({
				where: { submission_id: jobId },
			})
			if (oldRegions.length > 0) {
				await tx.studentPaperAnswerRegion.createMany({
					data: oldRegions.map((r) => ({
						submission_id: created.id,
						question_id: r.question_id,
						question_number: r.question_number,
						page_order: r.page_order,
						box: r.box as never,
						source: r.source,
					})),
				})
			}

			await tx.studentSubmission.update({
				where: { id: jobId },
				data: { superseded_at: new Date(), supersede_reason: "re-grade" },
			})

			return created
		})

		await sqs.send(
			new SendMessageCommand({
				QueueUrl: Resource.StudentPaperQueue.url,
				MessageBody: JSON.stringify({ job_id: newSub.id }),
			}),
		)

		ctx.log.info("Re-grading triggered — new submission created", {
			oldJobId: jobId,
			newJobId: newSub.id,
		})
		return { newJobId: newSub.id }
	},
)

export const retriggerOcr = resourceAction({
	type: "submission",
	role: "editor",
	schema: z.object({ jobId: z.string() }),
	id: ({ jobId }) => jobId,
}).action(
	async ({ parsedInput: { jobId }, ctx }): Promise<{ newJobId: string }> => {
		const oldSub = await db.studentSubmission.findFirst({
			where: { id: jobId },
		})
		if (!oldSub) throw new Error("Job not found")

		type PageEntry = { key: string; order: number; mime_type: string }
		const pages = (oldSub.pages ?? []) as PageEntry[]
		if (pages.length === 0) {
			throw new Error("No pages uploaded — cannot re-scan")
		}

		const newSub = await db.$transaction(async (tx) => {
			const created = await tx.studentSubmission.create({
				data: {
					s3_key: oldSub.s3_key,
					s3_bucket: oldSub.s3_bucket,
					uploaded_by: oldSub.uploaded_by,
					exam_paper_id: oldSub.exam_paper_id,
					exam_board: oldSub.exam_board,
					subject: oldSub.subject,
					year: oldSub.year,
					pages: oldSub.pages as never,
					student_name: oldSub.student_name,
					student_id: oldSub.student_id,
					batch_job_id: oldSub.batch_job_id,
					staged_script_id: oldSub.staged_script_id,
				},
			})
			await tx.resourceGrant.create({
				data: {
					resource_type: ResourceGrantResourceType.student_submission,
					resource_id: created.id,
					principal_type: ResourceGrantPrincipalType.user,
					principal_user_id: oldSub.uploaded_by,
					role: ResourceGrantRole.owner,
					created_by: oldSub.uploaded_by,
					accepted_at: new Date(),
				},
			})

			await tx.studentSubmission.update({
				where: { id: jobId },
				data: { superseded_at: new Date(), supersede_reason: "re-scan" },
			})

			return created
		})

		await sqs.send(
			new SendMessageCommand({
				QueueUrl: Resource.StudentPaperOcrQueue.url,
				MessageBody: JSON.stringify({ job_id: newSub.id }),
			}),
		)

		ctx.log.info("Re-OCR triggered — new submission created", {
			oldJobId: jobId,
			newJobId: newSub.id,
		})
		return { newJobId: newSub.id }
	},
)
