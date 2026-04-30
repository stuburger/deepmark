"use server"

import { resourceAction, resourcesAction } from "@/lib/authz"
import { db } from "@/lib/db"
import { z } from "zod"
import { embedText } from "../server-only/embeddings"

import type { SimilarPair } from "./types"

// ─── Query ───────────────────────────────────────────────────────────────────

/**
 * For each question in the paper, finds the nearest neighbour within the same
 * paper using vector cosine similarity. Returns pairs with distance < 0.15
 * (tighter than the matching threshold to avoid false positives).
 *
 * Deduplicates symmetric pairs (A,B) == (B,A) so each pair appears once.
 */
export const getSimilarQuestionsForPaper = resourceAction({
	type: "examPaper",
	role: "viewer",
	schema: z.object({ examPaperId: z.string() }),
	id: ({ examPaperId }) => examPaperId,
}).action(
	async ({
		parsedInput: { examPaperId },
	}): Promise<{ pairs: SimilarPair[] }> => {
		const rows = await db.$queryRaw<{ id: string; embedding: string | null }[]>`
		SELECT q.id, q.embedding::text AS embedding
		FROM questions q
		JOIN exam_section_questions esq ON esq.question_id = q.id
		JOIN exam_sections es ON es.id = esq.exam_section_id
		WHERE es.exam_paper_id = ${examPaperId}
		AND q.embedding IS NOT NULL
	`

		if (rows.length < 2) return { pairs: [] }

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

		return { pairs }
	},
)

// ─── Mutation ────────────────────────────────────────────────────────────────

const consolidateInput = z
	.object({
		keepQuestionId: z.string(),
		discardQuestionId: z.string(),
		overrideText: z.string().trim().optional(),
		discardMarkSchemeId: z.string().optional(),
	})
	.refine((v) => v.keepQuestionId !== v.discardQuestionId, {
		message: "Cannot consolidate a question with itself",
		path: ["discardQuestionId"],
	})

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
export const consolidateQuestions = resourcesAction({
	schema: consolidateInput,
	resources: [
		{
			type: "question",
			role: "editor",
			ids: ({ keepQuestionId, discardQuestionId }) => [
				keepQuestionId,
				discardQuestionId,
			],
		},
	],
}).action(
	async ({
		parsedInput: {
			keepQuestionId,
			discardQuestionId,
			overrideText,
			discardMarkSchemeId,
		},
		ctx,
	}) => {
		ctx.log.info("consolidateQuestions called", {
			keepQuestionId,
			discardQuestionId,
			hasOverrideText: !!overrideText,
			discardMarkSchemeId: discardMarkSchemeId ?? null,
		})

		await db.$transaction(async (tx) => {
			if (overrideText) {
				await tx.question.update({
					where: { id: keepQuestionId },
					data: { text: overrideText },
				})
			}

			if (discardMarkSchemeId) {
				await tx.markSchemeTestRun.deleteMany({
					where: { mark_scheme_id: discardMarkSchemeId },
				})
				await tx.exemplarAnswer.deleteMany({
					where: { mark_scheme_id: discardMarkSchemeId },
				})
				await tx.markScheme.delete({
					where: { id: discardMarkSchemeId },
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
		if (overrideText) {
			try {
				const values = await embedText(overrideText)
				if (values) {
					const vecStr = `[${values.join(",")}]`
					await db.$executeRaw`
						UPDATE questions SET embedding = (${vecStr}::text)::vector WHERE id = ${keepQuestionId}
					`
					ctx.log.info("Embedding regenerated after merge", { keepQuestionId })
				}
			} catch (embErr) {
				ctx.log.error("Failed to regenerate embedding after merge", {
					keepQuestionId,
					error: String(embErr),
				})
			}
		}

		ctx.log.info("Questions consolidated", {
			keepQuestionId,
			discardQuestionId,
		})

		return { ok: true as const }
	},
)
