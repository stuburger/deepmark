"use server"

import { createPrismaClient } from "@mcp-gcse/db"
import { Resource } from "sst"
import { auth } from "../auth"
import { embedText } from "../embeddings"
import { log } from "../logger"

const TAG = "exam-paper/similarity"
const db = createPrismaClient(Resource.NeonPostgres.databaseUrl)

export type ConsolidateQuestionsResult =
	| { ok: true }
	| { ok: false; error: string }

/**
 * Merges two duplicate questions into one:
 * 1. Optionally updates the kept question's text (and regenerates its embedding).
 * 2. Optionally deletes a specific mark scheme from the discarded question instead
 *    of moving it (used when both questions have a mark scheme and the user picks
 *    which to keep).
 * 3. Moves remaining mark schemes from `discardId` onto `keepId`.
 * 4. Removes `discardId` from all exam section question lists.
 * 5. Deletes the `discardId` question.
 *
 * Runs in a transaction to avoid partial state.
 */
export async function consolidateQuestions(
	keepQuestionId: string,
	discardQuestionId: string,
	opts?: {
		/** Override the kept question's text (e.g. user preferred the discard's wording) */
		overrideText?: string
		/** Mark scheme ID on the discard question to delete rather than move */
		discardMarkSchemeId?: string
	},
): Promise<ConsolidateQuestionsResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	if (keepQuestionId === discardQuestionId) {
		return { ok: false, error: "Cannot consolidate a question with itself" }
	}

	log.info(TAG, "consolidateQuestions called", {
		userId: session.userId,
		keepQuestionId,
		discardQuestionId,
		hasOverrideText: !!opts?.overrideText,
		discardMarkSchemeId: opts?.discardMarkSchemeId ?? null,
	})

	try {
		await db.$transaction(async (tx) => {
			if (opts?.overrideText) {
				await tx.question.update({
					where: { id: keepQuestionId },
					data: { text: opts.overrideText },
				})
			}

			if (opts?.discardMarkSchemeId) {
				await tx.markSchemeTestRun.deleteMany({
					where: { mark_scheme_id: opts.discardMarkSchemeId },
				})
				await tx.exemplarAnswer.deleteMany({
					where: { mark_scheme_id: opts.discardMarkSchemeId },
				})
				await tx.markScheme.delete({
					where: { id: opts.discardMarkSchemeId },
				})
			}

			await tx.markScheme.updateMany({
				where: { question_id: discardQuestionId },
				data: { question_id: keepQuestionId, link_status: "auto_linked" },
			})

			await tx.examSectionQuestion.deleteMany({
				where: { question_id: discardQuestionId },
			})

			await tx.question.delete({
				where: { id: discardQuestionId },
			})
		})

		// Regenerate embedding if text was overridden (outside transaction — best effort)
		if (opts?.overrideText) {
			try {
				const values = await embedText(opts.overrideText)
				if (values) {
					const vecStr = `[${values.join(",")}]`
					await db.$executeRaw`
						UPDATE questions SET embedding = (${vecStr}::text)::vector WHERE id = ${keepQuestionId}
					`
					log.info(TAG, "Embedding regenerated after merge", { keepQuestionId })
				}
			} catch (embErr) {
				log.error(TAG, "Failed to regenerate embedding after merge", {
					keepQuestionId,
					error: String(embErr),
				})
			}
		}

		log.info(TAG, "Questions consolidated", {
			userId: session.userId,
			keepQuestionId,
			discardQuestionId,
		})

		return { ok: true }
	} catch (err) {
		log.error(TAG, "consolidateQuestions failed", {
			userId: session.userId,
			keepQuestionId,
			discardQuestionId,
			error: String(err),
		})
		return { ok: false, error: "Failed to consolidate questions" }
	}
}
