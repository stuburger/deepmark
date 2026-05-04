"use server"

import { resourceAction } from "@/lib/authz"
import { assertPapersQuota } from "@/lib/billing/entitlement"
import { insertConsumesForBatch } from "@/lib/billing/ledger"
import { db } from "@/lib/db"
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs"
import {
	type Plan,
	ResourceGrantPrincipalType,
	ResourceGrantResourceType,
	ResourceGrantRole,
	lookupCurrentPeriodId,
} from "@mcp-gcse/db"
import { Resource } from "sst"
import { z } from "zod"

const sqs = new SQSClient({})

/**
 * Resolve which billing period this user's reserve-on-submit consume row
 * should snapshot, and whether to skip the ledger write entirely (admin /
 * Limitless are uncapped). Looked up once per re-mark / re-scan call,
 * outside the transaction, so the snapshot is stable across the tx.
 */
async function resolveLedgerContext(userId: string): Promise<{
	skip: boolean
	periodId: string | null
	plan: Plan | null
}> {
	const user = await db.user.findUnique({
		where: { id: userId },
		select: { plan: true, role: true },
	})
	if (user?.role === "admin" || user?.plan === "limitless_monthly") {
		return { skip: true, periodId: null, plan: user?.plan ?? null }
	}
	const periodId = await lookupCurrentPeriodId({
		db,
		userId,
		plan: user?.plan ?? null,
	})
	return { skip: false, periodId, plan: user?.plan ?? null }
}

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

		await assertPapersQuota({ user: ctx.user, additionalPapers: 1 })

		const ledger = await resolveLedgerContext(oldSub.uploaded_by)

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

			// Pre-create the GradingRun in `pending` so the consume row's FK is
			// satisfied. The grade Lambda's `claimGradingRun` already handles a
			// pre-existing pending row.
			await tx.gradingRun.create({
				data: {
					id: created.id,
					submission_id: created.id,
					ocr_run_id: created.id,
					status: "pending",
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

			// Reserve the paper-ledger consume atomically with the work above.
			if (!ledger.skip) {
				await insertConsumesForBatch({
					userId: oldSub.uploaded_by,
					gradingRunIds: [created.id],
					periodId: ledger.periodId,
					plan: ledger.plan,
					tx,
				})
			}

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

		await assertPapersQuota({ user: ctx.user, additionalPapers: 1 })

		const ledger = await resolveLedgerContext(oldSub.uploaded_by)

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

			// Pre-create OcrRun + GradingRun in `pending` so the consume row's
			// FK to grading_run is satisfied. The OCR Lambda's upsert handles
			// the existing pending row; same for the grade Lambda's claim.
			await tx.ocrRun.create({
				data: {
					id: created.id,
					submission_id: created.id,
					status: "pending",
				},
			})
			await tx.gradingRun.create({
				data: {
					id: created.id,
					submission_id: created.id,
					ocr_run_id: created.id,
					status: "pending",
				},
			})

			await tx.studentSubmission.update({
				where: { id: jobId },
				data: { superseded_at: new Date(), supersede_reason: "re-scan" },
			})

			// Reserve the paper-ledger consume atomically with the work above.
			if (!ledger.skip) {
				await insertConsumesForBatch({
					userId: oldSub.uploaded_by,
					gradingRunIds: [created.id],
					periodId: ledger.periodId,
					plan: ledger.plan,
					tx,
				})
			}

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
