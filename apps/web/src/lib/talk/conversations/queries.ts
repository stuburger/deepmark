"use server"

import { authenticatedAction, resourceAction } from "@/lib/authz"
import { db } from "@/lib/db"
import type { Prisma } from "@mcp-gcse/db"
import { z } from "zod"

export type ConversationSummary = {
	id: string
	title: string | null
	model: string
	updated_at: string
	submission_refs: Array<{
		submission_id: string
		student_name: string | null
		exam_paper_title: string
	}>
}

export type ConversationDetail = ConversationSummary & {
	messages: unknown[]
}

const conversationSummarySelect = {
	id: true,
	title: true,
	model: true,
	updated_at: true,
	submissions: {
		select: {
			submission: {
				select: {
					id: true,
					student_name: true,
					exam_paper: { select: { title: true } },
				},
			},
		},
	},
} satisfies Prisma.TalkConversationSelect

function toSummary(row: {
	id: string
	title: string | null
	model: string
	updated_at: Date
	submissions: Array<{
		submission: {
			id: string
			student_name: string | null
			exam_paper: { title: string }
		}
	}>
}): ConversationSummary {
	return {
		id: row.id,
		title: row.title,
		model: row.model,
		updated_at: row.updated_at.toISOString(),
		submission_refs: row.submissions.map((s) => ({
			submission_id: s.submission.id,
			student_name: s.submission.student_name,
			exam_paper_title: s.submission.exam_paper.title,
		})),
	}
}

/**
 * Most-recent conversation owned by the caller that references this
 * submission. Drives the editor's 24h auto-resume — the caller decides
 * whether to attach based on `updated_at` freshness.
 *
 * `resourceAction` on the submission so a teacher can't fish for another
 * teacher's conversation history via a guessed submission id.
 */
export const getRecentConversationForSubmission = resourceAction({
	type: "submission",
	role: "viewer",
	schema: z.object({ submissionId: z.string() }),
	id: ({ submissionId }) => submissionId,
}).action(
	async ({
		parsedInput: { submissionId },
		ctx,
	}): Promise<{ conversation: ConversationDetail | null }> => {
		const join = await db.talkConversationSubmission.findFirst({
			where: {
				submission_id: submissionId,
				conversation: { user_id: ctx.user.id },
			},
			orderBy: { conversation: { updated_at: "desc" } },
			select: {
				conversation: {
					select: {
						...conversationSummarySelect,
						messages: true,
					},
				},
			},
		})
		if (!join) return { conversation: null }
		const row = join.conversation
		return {
			conversation: {
				...toSummary(row),
				messages: Array.isArray(row.messages)
					? (row.messages as unknown[])
					: [],
			},
		}
	},
)

/**
 * Most-recent conversation owned by the caller, regardless of which
 * submissions it has referenced. Drives the dashboard / /teacher/talk
 * auto-resume (no freshness cap there).
 */
export const getRecentConversationGlobal = authenticatedAction.action(
	async ({ ctx }): Promise<{ conversation: ConversationDetail | null }> => {
		const row = await db.talkConversation.findFirst({
			where: { user_id: ctx.user.id },
			orderBy: { updated_at: "desc" },
			select: {
				...conversationSummarySelect,
				messages: true,
			},
		})
		if (!row) return { conversation: null }
		return {
			conversation: {
				...toSummary(row),
				messages: Array.isArray(row.messages)
					? (row.messages as unknown[])
					: [],
			},
		}
	},
)

/**
 * Load one conversation by id, owner-only. Drives the popover's
 * row-click handler — the row gets a summary; we fetch the full
 * messages JSONB only when the teacher actually opens the conversation.
 */
export const getConversationById = authenticatedAction
	.schema(z.object({ conversationId: z.string() }))
	.action(
		async ({
			parsedInput: { conversationId },
			ctx,
		}): Promise<{ conversation: ConversationDetail | null }> => {
			const row = await db.talkConversation.findUnique({
				where: { id: conversationId },
				select: {
					user_id: true,
					...conversationSummarySelect,
					messages: true,
				},
			})
			if (!row || row.user_id !== ctx.user.id) {
				return { conversation: null }
			}
			return {
				conversation: {
					...toSummary(row),
					messages: Array.isArray(row.messages)
						? (row.messages as unknown[])
						: [],
				},
			}
		},
	)

/**
 * Paginated list of the caller's conversations, newest first. Drives
 * the history popover. Submission refs are included so each row can
 * render its chips without a second query.
 *
 * Pagination is cursor-style on `updated_at` — caller passes the
 * `updated_at` of the last row they have to fetch older.
 */
export const listConversations = authenticatedAction
	.schema(
		z.object({
			limit: z.number().int().min(1).max(100).optional(),
			before: z.string().datetime().optional(),
		}),
	)
	.action(
		async ({
			parsedInput: { limit, before },
			ctx,
		}): Promise<{ conversations: ConversationSummary[] }> => {
			const rows = await db.talkConversation.findMany({
				where: {
					user_id: ctx.user.id,
					...(before ? { updated_at: { lt: new Date(before) } } : {}),
				},
				orderBy: { updated_at: "desc" },
				take: limit ?? 50,
				select: conversationSummarySelect,
			})
			return { conversations: rows.map(toSummary) }
		},
	)
