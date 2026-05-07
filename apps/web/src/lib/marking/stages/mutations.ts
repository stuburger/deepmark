"use server"

import { resourceAction } from "@/lib/authz"
import { assertPapersQuota } from "@/lib/billing/entitlement"
import { insertConsumesForBatch } from "@/lib/billing/ledger"
import { db } from "@/lib/db"
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs"
import {
	type Plan,
	type Prisma,
	ResourceGrantPrincipalType,
	ResourceGrantResourceType,
	ResourceGrantRole,
	type Subject,
	lookupCurrentPeriodId,
} from "@mcp-gcse/db"
import { Resource } from "sst"
import { z } from "zod"

const sqs = new SQSClient({})

type LedgerContext = {
	skip: boolean
	periodId: string | null
	plan: Plan | null
}

/**
 * The fields needed to clone a StudentSubmission row for a re-grade or
 * re-scan. Both flows mint a brand-new submission carrying every paper-level
 * attribute of the parent (s3 location, paper, board, subject, year, pages,
 * student) and stamping `parent_submission_id` for DAG lineage. Keep this
 * helper in lockstep with the StudentSubmission schema — adding a column
 * means adding it here once, not at every call site.
 */
type SubmissionCloneSource = {
	s3_key: string
	s3_bucket: string
	uploaded_by: string
	exam_paper_id: string
	exam_board: string
	subject: Subject | null
	year: number | null
	pages: unknown
	student_name: string | null
	student_id: string | null
	staged_script_id: string
}

function submissionCloneFields(
	oldSub: SubmissionCloneSource,
	args: { parentSubmissionId: string; processingBatchId: string },
) {
	return {
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
		staged_script_id: oldSub.staged_script_id,
		parent_submission_id: args.parentSubmissionId,
		processing_batch_id: args.processingBatchId,
	}
}

/**
 * Resolve which billing period this user's reserve-on-submit consume row
 * should snapshot, and whether to skip the ledger write entirely (admin /
 * Unlimited are uncapped). Looked up once per re-mark / re-scan call,
 * outside the transaction, so the snapshot is stable across the tx.
 */
async function resolveLedgerContext(userId: string): Promise<LedgerContext> {
	const user = await db.user.findUnique({
		where: { id: userId },
		select: { plan: true, role: true },
	})
	if (user?.role === "admin" || user?.plan === "unlimited_monthly") {
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
 * Clone a submission for re-grading: create a new StudentSubmission carrying
 * the same OCR data + tokens + answer regions, supersede the old one, and
 * reserve a paper-ledger consume row. Returns the new submission id. The
 * caller is responsible for sending the SQS message that kicks grading off.
 *
 * Designed to run inside a single Prisma transaction so partial failures
 * leave the old row intact.
 */
async function cloneSubmissionForRegradeTx(
	tx: Prisma.TransactionClient,
	oldSubmissionId: string,
	ledger: LedgerContext,
	processingBatchId: string,
): Promise<string> {
	const oldSub = await tx.studentSubmission.findFirst({
		where: { id: oldSubmissionId },
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
	if (!oldSub) throw new Error(`Submission ${oldSubmissionId} not found`)

	const latestOcr = oldSub.ocr_runs[0]
	if (!latestOcr?.extracted_answers_raw) {
		throw new Error(
			`Submission ${oldSubmissionId} has no extracted answers — run OCR first`,
		)
	}

	const created = await tx.studentSubmission.create({
		data: submissionCloneFields(oldSub, {
			parentSubmissionId: oldSubmissionId,
			processingBatchId,
		}),
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

	await tx.gradingRun.create({
		data: {
			id: created.id,
			submission_id: created.id,
			ocr_run_id: created.id,
			status: "pending",
		},
	})

	const oldTokens = await tx.studentPaperPageToken.findMany({
		where: { submission_id: oldSubmissionId },
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
		where: { submission_id: oldSubmissionId },
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

	// Supersede every currently-active sibling for this staged script — not
	// just the explicit parent. Without this, regrading from a stale URL (e.g.
	// the version-switcher viewing v3 of a chain whose head is v15) leaves v15
	// alive and creates a fork. parent_submission_id preserves true lineage;
	// the listing UI relies on a single active row per staged_script_id.
	await tx.studentSubmission.updateMany({
		where: {
			staged_script_id: oldSub.staged_script_id,
			id: { not: created.id },
			superseded_at: null,
		},
		data: { superseded_at: new Date(), supersede_reason: "re-grade" },
	})

	if (!ledger.skip) {
		await insertConsumesForBatch({
			userId: oldSub.uploaded_by,
			gradingRunIds: [created.id],
			periodId: ledger.periodId,
			plan: ledger.plan,
			tx,
		})
	}

	return created.id
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
			select: { uploaded_by: true, exam_paper_id: true },
		})
		if (!oldSub) throw new Error("Job not found")

		await assertPapersQuota({ user: ctx.user, additionalPapers: 1 })

		const ledger = await resolveLedgerContext(oldSub.uploaded_by)

		const newJobId = await db.$transaction(async (tx) => {
			const processingBatch = await tx.processingBatch.create({
				data: {
					exam_paper_id: oldSub.exam_paper_id,
					triggered_by: oldSub.uploaded_by,
					kind: "re_grade",
					total_jobs: 1,
				},
			})
			return cloneSubmissionForRegradeTx(tx, jobId, ledger, processingBatch.id)
		})

		await sqs.send(
			new SendMessageCommand({
				QueueUrl: Resource.StudentPaperQueue.url,
				MessageBody: JSON.stringify({ job_id: newJobId }),
			}),
		)

		ctx.log.info("Re-grading triggered — new submission created", {
			oldJobId: jobId,
			newJobId,
		})
		return { newJobId }
	},
)

/**
 * Re-grade a batch of submissions for an exam paper. If `submissionIds` is
 * provided, only those are regraded; otherwise every current (non-superseded)
 * submission for the paper is. Each regrade clones from the latest OCR data
 * (no re-extraction), supersedes the old submission, and reserves one paper
 * credit per submission.
 *
 * SQS messages are staggered to avoid a thundering herd on the LLM.
 */
export const regradeSubmissions = resourceAction({
	type: "examPaper",
	role: "editor",
	schema: z.object({
		examPaperId: z.string(),
		submissionIds: z.array(z.string()).optional(),
	}),
	id: ({ examPaperId }) => examPaperId,
}).action(
	async ({
		parsedInput: { examPaperId, submissionIds },
		ctx,
	}): Promise<{ count: number; newJobIds: string[] }> => {
		const targets = await db.studentSubmission.findMany({
			where: {
				exam_paper_id: examPaperId,
				superseded_at: null,
				ocr_runs: { some: { status: "complete" } },
				...(submissionIds && submissionIds.length > 0
					? { id: { in: submissionIds } }
					: {}),
			},
			select: { id: true, uploaded_by: true },
			orderBy: { created_at: "desc" },
		})

		if (targets.length === 0) {
			throw new Error("No submissions to regrade")
		}

		await assertPapersQuota({
			user: ctx.user,
			additionalPapers: targets.length,
		})

		const ledgerCache = new Map<string, LedgerContext>()
		for (const t of targets) {
			if (!ledgerCache.has(t.uploaded_by)) {
				ledgerCache.set(
					t.uploaded_by,
					await resolveLedgerContext(t.uploaded_by),
				)
			}
		}

		// One ProcessingBatch covers the whole regrade action — every cloned
		// submission lands in the same notification group, so the user gets
		// one email/push when the full set has settled.
		const processingBatch = await db.processingBatch.create({
			data: {
				exam_paper_id: examPaperId,
				triggered_by: ctx.user.id,
				kind: "re_grade",
				total_jobs: targets.length,
			},
		})

		const newJobIds: string[] = []
		for (const t of targets) {
			const ledger = ledgerCache.get(t.uploaded_by)
			if (!ledger) throw new Error("Ledger context missing")
			const newJobId = await db.$transaction((tx) =>
				cloneSubmissionForRegradeTx(tx, t.id, ledger, processingBatch.id),
			)
			newJobIds.push(newJobId)
		}

		// Stagger SQS messages so a batch of 80 doesn't fire 80 simultaneous
		// LLM calls — each delay slot is 2s, capped at 15 minutes (SQS max).
		await Promise.all(
			newJobIds.map((id, i) =>
				sqs.send(
					new SendMessageCommand({
						QueueUrl: Resource.StudentPaperQueue.url,
						MessageBody: JSON.stringify({ job_id: id }),
						DelaySeconds: Math.min(900, i * 2),
					}),
				),
			),
		)

		ctx.log.info("Batch regrade triggered", {
			examPaperId,
			count: targets.length,
		})

		return { count: targets.length, newJobIds }
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
			const processingBatch = await tx.processingBatch.create({
				data: {
					exam_paper_id: oldSub.exam_paper_id,
					triggered_by: oldSub.uploaded_by,
					kind: "re_extract",
					total_jobs: 1,
				},
			})
			const created = await tx.studentSubmission.create({
				data: submissionCloneFields(oldSub, {
					parentSubmissionId: jobId,
					processingBatchId: processingBatch.id,
				}),
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

			// Supersede every currently-active sibling for this staged script,
			// not just the explicit parent — see cloneSubmissionForRegradeTx for
			// why (forks otherwise leak through stale URLs).
			await tx.studentSubmission.updateMany({
				where: {
					staged_script_id: oldSub.staged_script_id,
					id: { not: created.id },
					superseded_at: null,
				},
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
