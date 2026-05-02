"use server"

import { authenticatedAction, resourceAction } from "@/lib/authz"
import { db } from "@/lib/db"
import { z } from "zod"
import { embedText } from "../../server-only/embeddings"

const updateQuestionInput = z.object({
	questionId: z.string(),
	input: z.object({
		text: z.string().optional(),
		points: z.number().int().min(0).optional(),
		question_number: z.string().nullable().optional(),
	}),
})

/**
 * Updates question text and/or marks. When text changes, regenerates the
 * embedding via Gemini so semantic search and mark-scheme matching stay accurate.
 */
export const updateQuestion = resourceAction({
	type: "question",
	role: "editor",
	schema: updateQuestionInput,
	id: ({ questionId }) => questionId,
}).action(
	async ({
		parsedInput: { questionId, input },
		ctx,
	}): Promise<{ embeddingUpdated: boolean }> => {
		const trimmedText = input.text?.trim()
		if (trimmedText !== undefined && trimmedText === "") {
			throw new Error("Question text cannot be empty")
		}

		ctx.log.info("updateQuestion called", {
			questionId,
			hasText: trimmedText !== undefined,
			hasPoints: input.points !== undefined,
		})

		const existing = await db.question.findUnique({
			where: { id: questionId },
			select: { text: true },
		})
		if (!existing) throw new Error("Question not found")

		const textChanged =
			trimmedText !== undefined && trimmedText !== existing.text

		await db.question.update({
			where: { id: questionId },
			data: {
				...(trimmedText !== undefined ? { text: trimmedText } : {}),
				...(input.points !== undefined ? { points: input.points } : {}),
				...(input.question_number !== undefined
					? { question_number: input.question_number || null }
					: {}),
				// A teacher edit is the resolution signal for any extraction
				// warning that was attached to this row — they've seen it and
				// acted. Clear it so the warning UI disappears.
				extraction_warning: null,
			},
		})

		let embeddingUpdated = false

		if (textChanged && trimmedText) {
			const values = await embedText(trimmedText)
			if (values) {
				const vecStr = `[${values.join(",")}]`
				await db.$executeRaw`
					UPDATE questions SET embedding = (${vecStr}::text)::vector WHERE id = ${questionId}
				`
				embeddingUpdated = true
				ctx.log.info("Embedding regenerated", { questionId })
			}
		}

		ctx.log.info("Question updated", {
			questionId,
			textChanged,
			embeddingUpdated,
		})

		return { embeddingUpdated }
	},
)

/**
 * Fully deletes a question and all associated data in a transaction.
 *
 * Cascade order (child-first to avoid FK violations):
 *  1. MarkSchemeTestRun → MarkScheme
 *  2. ExemplarAnswer linked to question or its mark schemes
 *  3. MarkScheme
 *  4. QuestionBankItem
 *  5. MarkingResult → Answer
 *  6. ExamSectionQuestion
 *  7. Question
 */
export const deleteQuestion = resourceAction({
	type: "question",
	role: "editor",
	schema: z.object({ questionId: z.string() }),
	id: ({ questionId }) => questionId,
}).action(
	async ({ parsedInput: { questionId }, ctx }): Promise<{ ok: true }> => {
		ctx.log.info("deleteQuestion called", { questionId })

		await db.$transaction(async (tx) => {
			const markSchemes = await tx.markScheme.findMany({
				where: { question_id: questionId },
				select: { id: true },
			})
			const markSchemeIds = markSchemes.map((ms) => ms.id)

			const answers = await tx.answer.findMany({
				where: { question_id: questionId },
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
						{ question_id: questionId },
					],
				},
			})

			await tx.markScheme.deleteMany({
				where: { question_id: questionId },
			})

			await tx.questionBankItem.deleteMany({
				where: { question_id: questionId },
			})

			await tx.markingResult.deleteMany({
				where: { answer_id: { in: answerIds } },
			})

			await tx.answer.deleteMany({
				where: { question_id: questionId },
			})

			await tx.examSectionQuestion.deleteMany({
				where: { question_id: questionId },
			})

			await tx.question.delete({ where: { id: questionId } })
		})

		ctx.log.info("Question deleted", { questionId })
		return { ok: true }
	},
)

// ─── Reorder ──────────────────────────────────────────────────────────────────

/**
 * Reorder questions inside a section. Uses the parent paper for authz —
 * sections aren't directly grant-bound. We resolve the paper from the section
 * inside the handler since the section→paper hop isn't a standard resource type.
 */
export const reorderQuestionsInSection = authenticatedAction
	.inputSchema(
		z.object({
			sectionId: z.string(),
			orderedQuestionIds: z.array(z.string()),
		}),
	)
	.action(
		async ({
			parsedInput: { sectionId, orderedQuestionIds },
			ctx,
		}): Promise<{ ok: true }> => {
			const section = await db.examSection.findUnique({
				where: { id: sectionId },
				select: { exam_paper_id: true },
			})
			const { AccessDeniedError, NotFoundError, assertExamPaperAccess } =
				await import("@/lib/authz")
			if (!section) throw new NotFoundError("Section not found")
			const access = await assertExamPaperAccess(
				ctx.user,
				section.exam_paper_id,
				"editor",
			)
			if (!access.ok) throw new AccessDeniedError(access.error)

			const n = orderedQuestionIds.length
			// Two-phase update to avoid unique constraint violations on (exam_section_id, order):
			// Phase 1 sets orders to a safe high range (n+1..2n), Phase 2 sets final values (1..n).
			await db.$transaction(async (tx) => {
				await Promise.all(
					orderedQuestionIds.map((questionId, index) =>
						tx.examSectionQuestion.update({
							where: {
								exam_section_id_question_id: {
									exam_section_id: sectionId,
									question_id: questionId,
								},
							},
							data: { order: n + index + 1 },
						}),
					),
				)
				await Promise.all(
					orderedQuestionIds.map((questionId, index) =>
						tx.examSectionQuestion.update({
							where: {
								exam_section_id_question_id: {
									exam_section_id: sectionId,
									question_id: questionId,
								},
							},
							data: { order: index + 1 },
						}),
					),
				)
			})
			return { ok: true }
		},
	)

export const reorderSections = resourceAction({
	type: "examPaper",
	role: "editor",
	schema: z.object({
		examPaperId: z.string(),
		orderedSectionIds: z.array(z.string()),
	}),
	id: ({ examPaperId }) => examPaperId,
}).action(
	async ({ parsedInput: { orderedSectionIds } }): Promise<{ ok: true }> => {
		const n = orderedSectionIds.length
		await db.$transaction(async (tx) => {
			await Promise.all(
				orderedSectionIds.map((sectionId, index) =>
					tx.examSection.update({
						where: { id: sectionId },
						data: { order: n + index + 1 },
					}),
				),
			)
			await Promise.all(
				orderedSectionIds.map((sectionId, index) =>
					tx.examSection.update({
						where: { id: sectionId },
						data: { order: index + 1 },
					}),
				),
			)
		})
		return { ok: true }
	},
)
