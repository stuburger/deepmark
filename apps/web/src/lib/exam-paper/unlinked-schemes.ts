"use server"

import { resourceAction, resourcesAction } from "@/lib/authz"
import { db } from "@/lib/db"
import { z } from "zod"
import type { UnlinkedMarkScheme } from "./types"

/**
 * Returns questions in the paper whose mark scheme has link_status = "unlinked".
 * These are "ghost" questions created by the ingestion pipeline that couldn't
 * be matched to an existing question paper question.
 */
export const getUnlinkedMarkSchemes = resourceAction({
	type: "examPaper",
	role: "viewer",
	schema: z.object({ examPaperId: z.string() }),
	id: ({ examPaperId }) => examPaperId,
}).action(
	async ({
		parsedInput: { examPaperId },
	}): Promise<{ items: UnlinkedMarkScheme[] }> => {
		const rows = await db.examSectionQuestion.findMany({
			where: {
				exam_section: { exam_paper_id: examPaperId },
				question: {
					mark_schemes: { some: { link_status: "unlinked" } },
				},
			},
			select: {
				question: {
					select: {
						id: true,
						text: true,
						question_number: true,
						mark_schemes: {
							where: { link_status: "unlinked" },
							select: {
								id: true,
								description: true,
								points_total: true,
							},
						},
					},
				},
			},
		})

		const items: UnlinkedMarkScheme[] = []
		for (const row of rows) {
			for (const ms of row.question.mark_schemes) {
				items.push({
					markSchemeId: ms.id,
					markSchemeDescription: ms.description,
					pointsTotal: ms.points_total,
					ghostQuestionId: row.question.id,
					ghostQuestionText: row.question.text,
					ghostQuestionNumber: row.question.question_number,
				})
			}
		}

		return { items }
	},
)

/**
 * Re-parents an unlinked mark scheme onto the chosen target question, then
 * cleans up the ghost question that was holding it.
 */
const linkInput = z
	.object({
		ghostQuestionId: z.string(),
		targetQuestionId: z.string(),
	})
	.refine((v) => v.ghostQuestionId !== v.targetQuestionId, {
		message: "Ghost and target question cannot be the same",
		path: ["targetQuestionId"],
	})

export const linkMarkSchemeToQuestion = resourcesAction({
	schema: linkInput,
	resources: [
		{
			type: "question",
			role: "editor",
			ids: ({ ghostQuestionId, targetQuestionId }) => [
				ghostQuestionId,
				targetQuestionId,
			],
		},
	],
}).action(
	async ({
		parsedInput: { ghostQuestionId, targetQuestionId },
		ctx,
	}): Promise<{ ok: true }> => {
		ctx.log.info("linkMarkSchemeToQuestion called", {
			ghostQuestionId,
			targetQuestionId,
		})

		await db.$transaction(async (tx) => {
			await tx.markScheme.updateMany({
				where: { question_id: ghostQuestionId, link_status: "unlinked" },
				data: { question_id: targetQuestionId, link_status: "linked" },
			})

			await tx.examSectionQuestion.deleteMany({
				where: { question_id: ghostQuestionId },
			})

			await tx.question.delete({ where: { id: ghostQuestionId } })
		})

		ctx.log.info("Mark scheme linked to question", {
			ghostQuestionId,
			targetQuestionId,
		})

		return { ok: true }
	},
)
