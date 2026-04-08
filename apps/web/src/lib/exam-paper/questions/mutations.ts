"use server"

import { createPrismaClient } from "@mcp-gcse/db"
import { Resource } from "sst"
import { auth } from "../../auth"
import { embedText } from "../../embeddings"
import { log } from "../../logger"
import type { UpdateQuestionInput } from "../types"

const TAG = "exam-paper/questions"
const db = createPrismaClient(Resource.NeonPostgres.databaseUrl)

// ─── Update question ──────────────────────────────────────────────────────────

export type UpdateQuestionResult =
	| { ok: true; embeddingUpdated: boolean }
	| { ok: false; error: string }

/**
 * Updates question text and/or marks. When text changes, regenerates the
 * embedding via Gemini so semantic search and mark-scheme matching stay accurate.
 */
export async function updateQuestion(
	questionId: string,
	input: UpdateQuestionInput,
): Promise<UpdateQuestionResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const trimmedText = input.text?.trim()
	if (trimmedText !== undefined && trimmedText === "") {
		return { ok: false, error: "Question text cannot be empty" }
	}

	log.info(TAG, "updateQuestion called", {
		userId: session.userId,
		questionId,
		hasText: trimmedText !== undefined,
		hasPoints: input.points !== undefined,
	})

	try {
		const existing = await db.question.findUnique({
			where: { id: questionId },
			select: { text: true },
		})
		if (!existing) return { ok: false, error: "Question not found" }

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
				log.info(TAG, "Embedding regenerated", { questionId })
			}
		}

		log.info(TAG, "Question updated", {
			userId: session.userId,
			questionId,
			textChanged,
			embeddingUpdated,
		})

		return { ok: true, embeddingUpdated }
	} catch (err) {
		log.error(TAG, "updateQuestion failed", {
			userId: session.userId,
			questionId,
			error: String(err),
		})
		return { ok: false, error: "Failed to update question" }
	}
}

// ─── Delete question ──────────────────────────────────────────────────────────

export type DeleteQuestionResult = { ok: true } | { ok: false; error: string }

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
export async function deleteQuestion(
	questionId: string,
): Promise<DeleteQuestionResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	log.info(TAG, "deleteQuestion called", { userId: session.userId, questionId })

	try {
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

		log.info(TAG, "Question deleted", { userId: session.userId, questionId })
		return { ok: true }
	} catch (err) {
		log.error(TAG, "deleteQuestion failed", {
			userId: session.userId,
			questionId,
			error: String(err),
		})
		return { ok: false, error: "Failed to delete question" }
	}
}

// ─── Reorder ──────────────────────────────────────────────────────────────────

export type ReorderResult = { ok: true } | { ok: false; error: string }

export async function reorderQuestionsInSection(
	sectionId: string,
	orderedQuestionIds: string[],
): Promise<ReorderResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }
	try {
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
	} catch (e) {
		console.error(e)
		return { ok: false, error: "Failed to reorder questions" }
	}
}

export async function reorderSections(
	examPaperId: string,
	orderedSectionIds: string[],
): Promise<ReorderResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }
	try {
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
	} catch {
		return { ok: false, error: "Failed to reorder sections" }
	}
}
