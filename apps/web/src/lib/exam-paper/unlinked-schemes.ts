"use server"

import { createPrismaClient } from "@mcp-gcse/db"
import { Resource } from "sst"
import { auth } from "../auth"
import { log } from "../logger"

import type { UnlinkedMarkScheme } from "./types"

const TAG = "exam-paper/unlinked-schemes"
const db = createPrismaClient(Resource.NeonPostgres.databaseUrl)

// ─── Query ───────────────────────────────────────────────────────────────────

export type GetUnlinkedMarkSchemesResult =
	| { ok: true; items: UnlinkedMarkScheme[] }
	| { ok: false; error: string }

/**
 * Returns questions in the paper whose mark scheme has link_status = "unlinked".
 * These are "ghost" questions created by the ingestion pipeline that couldn't
 * be matched to an existing question paper question.
 */
export async function getUnlinkedMarkSchemes(
	examPaperId: string,
): Promise<GetUnlinkedMarkSchemesResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	try {
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

		return { ok: true, items }
	} catch (err) {
		log.error(TAG, "getUnlinkedMarkSchemes failed", {
			examPaperId,
			error: String(err),
		})
		return { ok: false, error: "Failed to load unlinked mark schemes" }
	}
}

// ─── Mutation ────────────────────────────────────────────────────────────────

export type LinkMarkSchemeToQuestionResult =
	| { ok: true }
	| { ok: false; error: string }

/**
 * Re-parents an unlinked mark scheme onto the chosen target question,
 * then cleans up the ghost question that was holding it.
 */
export async function linkMarkSchemeToQuestion(
	ghostQuestionId: string,
	targetQuestionId: string,
): Promise<LinkMarkSchemeToQuestionResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	if (ghostQuestionId === targetQuestionId) {
		return { ok: false, error: "Ghost and target question cannot be the same" }
	}

	log.info(TAG, "linkMarkSchemeToQuestion called", {
		userId: session.userId,
		ghostQuestionId,
		targetQuestionId,
	})

	try {
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

		log.info(TAG, "Mark scheme linked to question", {
			userId: session.userId,
			ghostQuestionId,
			targetQuestionId,
		})

		return { ok: true }
	} catch (err) {
		log.error(TAG, "linkMarkSchemeToQuestion failed", {
			userId: session.userId,
			ghostQuestionId,
			targetQuestionId,
			error: String(err),
		})
		return { ok: false, error: "Failed to link mark scheme" }
	}
}
