"use server"

import { db } from "@/lib/db"
import { auth } from "../auth"
import { embedText } from "../embeddings"
import { log } from "../logger"

import type { SimilarPair } from "./types"

const TAG = "exam-paper/similarity"

// ─── Query ───────────────────────────────────────────────────────────────────

export type GetSimilarQuestionsForPaperResult =
	| { ok: true; pairs: SimilarPair[] }
	| { ok: false; error: string }

/**
 * For each question in the paper, finds the nearest neighbour within the same
 * paper using vector cosine similarity. Returns pairs with distance < 0.15
 * (tighter than the matching threshold to avoid false positives).
 *
 * Deduplicates symmetric pairs (A,B) == (B,A) so each pair appears once.
 */
export async function getSimilarQuestionsForPaper(
	examPaperId: string,
): Promise<GetSimilarQuestionsForPaperResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	try {
		const rows = await db.$queryRaw<{ id: string; embedding: string | null }[]>`
			SELECT q.id, q.embedding::text AS embedding
			FROM questions q
			JOIN exam_section_questions esq ON esq.question_id = q.id
			JOIN exam_sections es ON es.id = esq.exam_section_id
			WHERE es.exam_paper_id = ${examPaperId}
			AND q.embedding IS NOT NULL
		`

		if (rows.length < 2) return { ok: true, pairs: [] }

		const seen = new Set<string>()
		const pairs: SimilarPair[] = []

		await Promise.all(
			rows.map(async (row) => {
				const nearRows = await db.$queryRaw<{ id: string; dist: number }[]>`
					SELECT q.id, (q.embedding <=> (SELECT embedding FROM questions WHERE id = ${row.id})) AS dist
					FROM questions q
					JOIN exam_section_questions esq ON esq.question_id = q.id
					JOIN exam_sections es ON es.id = esq.exam_section_id
					WHERE es.exam_paper_id = ${examPaperId}
					AND q.id != ${row.id}
					AND q.embedding IS NOT NULL
					ORDER BY dist ASC
					LIMIT 1
				`
				const near = nearRows[0]
				if (!near || Number(near.dist) >= 0.15) return

				const key = [row.id, near.id].sort().join(":")
				if (seen.has(key)) return
				seen.add(key)
				pairs.push({
					questionId: row.id,
					similarToId: near.id,
					distance: Number(near.dist),
				})
			}),
		)

		return { ok: true, pairs }
	} catch (err) {
		log.error(TAG, "getSimilarQuestionsForPaper failed", {
			examPaperId,
			error: String(err),
		})
		return { ok: false, error: "Failed to compute similarity" }
	}
}

// ─── Mutation ────────────────────────────────────────────────────────────────

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
