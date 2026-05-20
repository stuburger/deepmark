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
 * Append a turn (one user message + one assistant message, typically) to
 * a conversation. Two modes:
 *
 *  1. `conversationId` is null → lazy-create a new conversation row using
 *     the caller as `user_id`, derive the title from the first user
 *     message in `messages`.
 *  2. `conversationId` is set → append to the existing row. Verifies
 *     ownership (`user_id === ctx.user.id`) before writing.
 *
 * `messages` is the full UIMessage[] (server treats it as authoritative —
 * the client sends its current view, server overwrites). MUST include
 * `metadata` per message; the selection chip lives there and is
 * load-bearing for the UI on resume.
 *
 * `submissionRefs` adds (conversation_id, submission_id) rows to the join
 * table. PK is `(conversation_id, submission_id)` so repeat refs become
 * no-ops via `createMany({ skipDuplicates: true })`.
 *
 * Returns the resolved `conversationId` so the client can pin to it on
 * follow-up turns.
 */
export const appendConversationTurn = authenticatedAction
	.schema(
		z.object({
			conversationId: z.string().nullable(),
			messages: z.array(messageSchema),
			submissionRefs: z.array(submissionRefSchema),
			model: z.string(),
		}),
	)
	.action(
		async ({
			parsedInput: { conversationId, messages, submissionRefs, model },
			ctx,
		}): Promise<{ conversationId: string }> => {
			const messagesJson = messages as unknown as object[]

			const conversation = conversationId
				? await db.talkConversation.findUnique({
						where: { id: conversationId },
						select: { id: true, user_id: true },
					})
				: null

			if (
				conversationId &&
				(!conversation || conversation.user_id !== ctx.user.id)
			) {
				// Treat as not-found to avoid leaking existence to another user.
				throw new Error("Conversation not found.")
			}

			const id = conversation
				? await updateExisting(conversation.id, messagesJson)
				: await createNew(ctx.user.id, messagesJson, model)

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

async function createNew(
	userId: string,
	messages: object[],
	model: string,
): Promise<string> {
	const title = deriveConversationTitle(
		messages as Array<{
			role: string
			parts?: Array<{ type: string; text?: string }>
		}>,
	)
	const row = await db.talkConversation.create({
		data: {
			user_id: userId,
			title,
			model,
			messages,
		},
		select: { id: true },
	})
	return row.id
}

async function updateExisting(id: string, messages: object[]): Promise<string> {
	await db.talkConversation.update({
		where: { id },
		data: { messages },
	})
	return id
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
