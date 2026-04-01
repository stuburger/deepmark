"use server"

import { createPrismaClient } from "@mcp-gcse/db"
import { Resource } from "sst"
import { auth } from "../auth"
import { log } from "../logger"

const TAG = "exam-paper/unlinked-schemes"
const db = createPrismaClient(Resource.NeonPostgres.databaseUrl)

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
