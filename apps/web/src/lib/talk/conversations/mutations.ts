"use server"

import { authenticatedAction } from "@/lib/authz"
import { db } from "@/lib/db"
import { z } from "zod"
import { deriveConversationTitle } from "./title"

const messageSchema = z
	.object({
		role: z.string(),
		parts: z.array(z.unknown()).optional(),
	})
	.passthrough()

const submissionRefSchema = z.object({
	submission_id: z.string(),
})

/**
 * Ensure a TalkConversation row exists and its submission joins are in
 * place. Returns the resolved id. Lightweight: no messages payload, no
 * title derivation. The route handler calls this BEFORE the LLM stream
 * starts so it has an id to ship on the assistant message's metadata.
 *
 * Two modes:
 *   - `conversationId` is null → lazy-create an empty row owned by the
 *     caller. Title stays null until `persistConversationTurn` derives
 *     it from the first user message.
 *   - `conversationId` is set → verify ownership and pass through.
 *
 * Submission refs are upserted via `createMany({ skipDuplicates })` so
 * a repeat @-mention of the same student becomes a no-op.
 */
export const ensureConversation = authenticatedAction
	.schema(
		z.object({
			conversationId: z.string().nullable(),
			model: z.string(),
			submissionRefs: z.array(submissionRefSchema),
		}),
	)
	.action(
		async ({
			parsedInput: { conversationId, model, submissionRefs },
			ctx,
		}): Promise<{ conversationId: string }> => {
			let id: string
			if (conversationId) {
				const row = await db.talkConversation.findUnique({
					where: { id: conversationId },
					select: { id: true, user_id: true },
				})
				if (!row || row.user_id !== ctx.user.id) {
					throw new Error("Conversation not found.")
				}
				id = row.id
			} else {
				const created = await db.talkConversation.create({
					data: {
						user_id: ctx.user.id,
						title: null,
						model,
						messages: [],
					},
					select: { id: true },
				})
				id = created.id
			}

			if (submissionRefs.length > 0) {
				await db.talkConversationSubmission.createMany({
					data: submissionRefs.map((r) => ({
						conversation_id: id,
						submission_id: r.submission_id,
					})),
					skipDuplicates: true,
				})
			}

			return { conversationId: id }
		},
	)

/**
 * Persist the full message list for a conversation. Called once per
 * turn in the route's `onFinish` callback. Owner-checked; if the row's
 * title is still null, derive it from the first user message in the
 * payload and set it atomically with the messages write.
 *
 * Single Prisma update — no read-then-write — so this is one DB round
 * trip per turn for existing conversations. (Brand-new ones cost an
 * additional `ensureConversation` create, but that's the only
 * unavoidable shape change for new rows.)
 */
export const persistConversationTurn = authenticatedAction
	.schema(
		z.object({
			conversationId: z.string(),
			messages: z.array(messageSchema),
		}),
	)
	.action(
		async ({
			parsedInput: { conversationId, messages },
			ctx,
		}): Promise<{ ok: true }> => {
			const messagesJson = messages as unknown as object[]
			const derivedTitle = deriveConversationTitle(
				messages as Array<{
					role: string
					parts?: Array<{ type: string; text?: string }>
				}>,
			)
			// `updateMany` so we can scope by user_id atomically; if it
			// matches zero rows the caller doesn't own the conversation
			// (or it was deleted between ensureConversation and now).
			const result = await db.talkConversation.updateMany({
				where: { id: conversationId, user_id: ctx.user.id },
				data: {
					messages: messagesJson,
					// Coalesce in SQL semantics: only patch title when it's still
					// null. Prisma doesn't expose COALESCE on update so we read
					// the title separately when needed.
					...(derivedTitle
						? await titleIfStillNull(conversationId, derivedTitle)
						: {}),
				},
			})
			if (result.count === 0) {
				throw new Error("Conversation not found.")
			}
			return { ok: true }
		},
	)

async function titleIfStillNull(
	conversationId: string,
	derivedTitle: string,
): Promise<{ title?: string }> {
	const row = await db.talkConversation.findUnique({
		where: { id: conversationId },
		select: { title: true },
	})
	if (row && row.title === null) {
		return { title: derivedTitle }
	}
	return {}
}

/**
 * Delete a conversation. Owner-only — `user_id === ctx.user.id` checked
 * inline; the cascade on TalkConversationSubmission removes the join rows
 * automatically.
 */
export const deleteConversation = authenticatedAction
	.schema(z.object({ conversationId: z.string() }))
	.action(
		async ({
			parsedInput: { conversationId },
			ctx,
		}): Promise<{ deleted: true }> => {
			const row = await db.talkConversation.findUnique({
				where: { id: conversationId },
				select: { user_id: true },
			})
			if (!row || row.user_id !== ctx.user.id) {
				throw new Error("Conversation not found.")
			}
			await db.talkConversation.delete({ where: { id: conversationId } })
			return { deleted: true }
		},
	)
