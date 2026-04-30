"use server"

import { authenticatedAction, resourceAction } from "@/lib/authz"
import { db } from "@/lib/db"
import {
	BoundaryMode,
	Prisma,
	ResourceGrantPrincipalType,
	ResourceGrantResourceType,
	ResourceGrantRole,
	Subject,
	TierLevel,
} from "@mcp-gcse/db"
import { type GradeBoundary, gradeBoundariesSchema } from "@mcp-gcse/shared"
import { z } from "zod"
import { typicalGradeBoundaryCreateData } from "./grade-boundary-defaults"

const subjectEnum = z.nativeEnum(Subject)
const tierEnum = z.nativeEnum(TierLevel)
const boundaryModeEnum = z.nativeEnum(BoundaryMode)

// ─── Create ───────────────────────────────────────────────────────────────────

const createInput = z.object({
	title: z.string().trim().min(1, "Title is required"),
	subject: subjectEnum,
	exam_board: z.string().trim().min(1),
	year: z.number().int(),
	paper_number: z.number().int().optional(),
	total_marks: z.number().int(),
	duration_minutes: z.number().int(),
	tier: tierEnum.nullable().optional(),
})

export const createExamPaperStandalone = authenticatedAction
	.inputSchema(createInput)
	.action(async ({ parsedInput: input, ctx }): Promise<{ id: string }> => {
		ctx.log.info("createExamPaperStandalone called", {
			title: input.title,
			subject: input.subject,
		})
		const paper = await db.$transaction(async (tx) => {
			const created = await tx.examPaper.create({
				data: {
					title: input.title,
					subject: input.subject,
					exam_board: input.exam_board,
					year: input.year,
					paper_number: input.paper_number ?? null,
					total_marks: input.total_marks,
					duration_minutes: input.duration_minutes,
					created_by_id: ctx.user.id,
					...typicalGradeBoundaryCreateData(input.subject, input.tier),
				},
			})
			await tx.resourceGrant.create({
				data: {
					resource_type: ResourceGrantResourceType.exam_paper,
					resource_id: created.id,
					principal_type: ResourceGrantPrincipalType.user,
					principal_user_id: ctx.user.id,
					principal_email: ctx.user.email,
					role: ResourceGrantRole.owner,
					created_by: ctx.user.id,
					accepted_at: new Date(),
				},
			})
			return created
		})
		ctx.log.info("Exam paper created", { id: paper.id, title: paper.title })
		return { id: paper.id }
	})

// ─── Update title ─────────────────────────────────────────────────────────────

export const updateExamPaperTitle = resourceAction({
	type: "examPaper",
	role: "editor",
	schema: z.object({
		id: z.string(),
		title: z.string().trim().min(1, "Title cannot be empty"),
	}),
	id: ({ id }) => id,
}).action(
	async ({ parsedInput: { id, title }, ctx }): Promise<{ ok: true }> => {
		ctx.log.info("updateExamPaperTitle called", { id })
		await db.examPaper.update({ where: { id }, data: { title } })
		return { ok: true }
	},
)

// ─── Paper settings (tier, grade boundaries) ─────────────────────────────────

const updateSettingsInput = z.object({
	examPaperId: z.string(),
	tier: tierEnum.nullable().optional(),
	grade_boundaries: z
		.array(gradeBoundariesSchema.element)
		.nullable()
		.optional(),
	grade_boundary_mode: boundaryModeEnum.nullable().optional(),
})

export const updatePaperSettings = resourceAction({
	type: "examPaper",
	role: "editor",
	schema: updateSettingsInput,
	id: ({ examPaperId }) => examPaperId,
}).action(
	async ({
		parsedInput: { examPaperId, tier, grade_boundaries, grade_boundary_mode },
		ctx,
	}): Promise<{ ok: true }> => {
		const data: Prisma.ExamPaperUpdateInput = {}

		if (tier !== undefined) {
			data.tier = tier
		}

		if (grade_boundaries !== undefined) {
			if (grade_boundaries === null) {
				data.grade_boundaries = Prisma.DbNull
			} else {
				const parsed = gradeBoundariesSchema.safeParse(grade_boundaries)
				if (!parsed.success) {
					throw new Error("Invalid grade boundaries")
				}
				data.grade_boundaries = parsed.data as Prisma.InputJsonValue
			}
		}

		if (grade_boundary_mode !== undefined) {
			data.grade_boundary_mode = grade_boundary_mode
		}

		if (Object.keys(data).length === 0) return { ok: true }

		ctx.log.info("updatePaperSettings called", {
			examPaperId,
			fields: Object.keys(data),
		})

		await db.examPaper.update({ where: { id: examPaperId }, data })
		return { ok: true }
	},
)

// ─── Level Descriptors ───────────────────────────────────────────────────────

export const updateLevelDescriptors = resourceAction({
	type: "examPaper",
	role: "editor",
	schema: z.object({
		examPaperId: z.string(),
		levelDescriptors: z.string(),
	}),
	id: ({ examPaperId }) => examPaperId,
}).action(
	async ({
		parsedInput: { examPaperId, levelDescriptors },
		ctx,
	}): Promise<{ ok: true }> => {
		const trimmed = levelDescriptors.trim()
		ctx.log.info("updateLevelDescriptors called", {
			examPaperId,
			length: trimmed.length,
		})
		await db.examPaper.update({
			where: { id: examPaperId },
			data: { level_descriptors: trimmed || null },
		})
		return { ok: true }
	},
)

// ─── Delete ───────────────────────────────────────────────────────────────────

/**
 * Fully deletes an exam paper and all associated data in a transaction.
 *
 * Cascade order (child-first to avoid FK violations):
 *  1. MarkSchemeTestRun → MarkScheme → Question (from paper jobs)
 *  2. ExemplarAnswer (from paper jobs)
 *  3. QuestionBankItem for questions in this paper
 *  4. MarkingResult / Answer for those questions
 *  5. ExamSectionQuestion → ExamSection
 *  6. PdfIngestionJob
 *  7. ExamPaper
 */
export const deleteExamPaper = resourceAction({
	type: "examPaper",
	role: "owner",
	schema: z.object({ id: z.string() }),
	id: ({ id }) => id,
}).action(async ({ parsedInput: { id }, ctx }): Promise<{ ok: true }> => {
	ctx.log.info("deleteExamPaper called", { id })

	await db.$transaction(
		async (tx) => {
			const sections = await tx.examSection.findMany({
				where: { exam_paper_id: id },
				select: { id: true },
			})
			const sectionIds = sections.map((s) => s.id)

			const sectionQuestions = await tx.examSectionQuestion.findMany({
				where: { exam_section_id: { in: sectionIds } },
				select: { question_id: true },
			})

			const jobs = await tx.pdfIngestionJob.findMany({
				where: { exam_paper_id: id },
				select: { id: true },
			})
			const jobIds = jobs.map((j) => j.id)

			const submissions = await tx.studentSubmission.findMany({
				where: { exam_paper_id: id },
				select: { id: true },
			})
			const submissionIds = submissions.map((s) => s.id)

			const jobQuestions = await tx.question.findMany({
				where: { source_pdf_ingestion_job_id: { in: jobIds } },
				select: { id: true },
			})

			const questionIds = [
				...new Set([
					...sectionQuestions.map((sq) => sq.question_id),
					...jobQuestions.map((q) => q.id),
				]),
			]

			const markSchemes = await tx.markScheme.findMany({
				where: { question_id: { in: questionIds } },
				select: { id: true },
			})
			const markSchemeIds = markSchemes.map((ms) => ms.id)

			const answers = await tx.answer.findMany({
				where: { question_id: { in: questionIds } },
				select: { id: true },
			})
			const answerIds = answers.map((a) => a.id)

			await tx.markSchemeTestRun.deleteMany({
				where: { mark_scheme_id: { in: markSchemeIds } },
			})

			await tx.exemplarAnswer.deleteMany({
				where: {
					OR: [
						{ mark_scheme_id: { in: markSchemeIds } },
						{ pdf_ingestion_job_id: { in: jobIds } },
					],
				},
			})

			await tx.markScheme.deleteMany({
				where: { question_id: { in: questionIds } },
			})

			await tx.questionBankItem.deleteMany({
				where: { question_id: { in: questionIds } },
			})

			await tx.markingResult.deleteMany({
				where: { answer_id: { in: answerIds } },
			})
			await tx.answer.deleteMany({
				where: { question_id: { in: questionIds } },
			})

			await tx.examSectionQuestion.deleteMany({
				where: { exam_section_id: { in: sectionIds } },
			})
			await tx.examSection.deleteMany({ where: { exam_paper_id: id } })

			await tx.question.deleteMany({
				where: { source_pdf_ingestion_job_id: { in: jobIds } },
			})

			await tx.pdfIngestionJob.deleteMany({ where: { exam_paper_id: id } })
			await tx.resourceGrant.deleteMany({
				where: {
					OR: [
						{
							resource_type: ResourceGrantResourceType.exam_paper,
							resource_id: id,
						},
						{
							resource_type: ResourceGrantResourceType.student_submission,
							resource_id: { in: submissionIds },
						},
					],
				},
			})

			await tx.examPaper.delete({ where: { id } })
		},
		{ timeout: 30000 },
	)

	ctx.log.info("Exam paper deleted", { id })
	return { ok: true }
})
