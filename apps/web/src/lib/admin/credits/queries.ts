"use server"

import type { LedgerEntryKind, Plan } from "@mcp-gcse/db"
import { z } from "zod"

import { adminAction } from "@/lib/authz"
import { db } from "@/lib/db"

export type UserCreditRow = {
	id: string
	email: string | null
	name: string | null
	role: string
	plan: Plan | null
	subscription_status: string | null
	balance: number
}

/**
 * One row per user with their current paper balance. Joins users to a
 * grouped paper_ledger SUM so we get balance for everyone in a single
 * query (no N+1).
 *
 * Sized for the alpha cohort (≤ 100 users); add pagination + a search
 * input when the table grows past a few screens.
 */
export const listUsersWithBalance = adminAction.action(
	async (): Promise<{
		users: UserCreditRow[]
	}> => {
		const [users, balances] = await Promise.all([
			db.user.findMany({
				select: {
					id: true,
					email: true,
					name: true,
					role: true,
					plan: true,
					subscription_status: true,
				},
				orderBy: { created_at: "desc" },
			}),
			db.paperLedgerEntry.groupBy({
				by: ["user_id"],
				_sum: { papers: true },
			}),
		])

		const balanceByUserId = new Map(
			balances.map((b) => [b.user_id, b._sum.papers ?? 0]),
		)

		return {
			users: users.map((u) => ({
				...u,
				balance: balanceByUserId.get(u.id) ?? 0,
			})),
		}
	},
)

export type LedgerEntryRow = {
	id: string
	created_at: Date
	papers: number
	kind: LedgerEntryKind
	note: string | null
	stripe_session_id: string | null
	stripe_invoice_id: string | null
	grading_run_id: string | null
	period_id: string | null
	granted_by_email: string | null
}

const ledgerInput = z.object({
	userId: z.string().min(1),
	limit: z.number().int().min(1).max(500).default(100),
})

/**
 * Per-user ledger history. Most recent first. Default cap of 100 keeps the
 * sheet snappy; bump via the `limit` param when forensics need more.
 */
export const getUserLedgerHistory = adminAction.inputSchema(ledgerInput).action(
	async ({
		parsedInput: { userId, limit },
	}): Promise<{
		entries: LedgerEntryRow[]
		balance: number
	}> => {
		const [entries, balanceAgg] = await Promise.all([
			db.paperLedgerEntry.findMany({
				where: { user_id: userId },
				orderBy: { created_at: "desc" },
				take: limit,
				select: {
					id: true,
					created_at: true,
					papers: true,
					kind: true,
					note: true,
					stripe_session_id: true,
					stripe_invoice_id: true,
					grading_run_id: true,
					period_id: true,
					granted_by_user: { select: { email: true } },
				},
			}),
			db.paperLedgerEntry.aggregate({
				where: { user_id: userId },
				_sum: { papers: true },
			}),
		])

		return {
			entries: entries.map((e) => ({
				id: e.id,
				created_at: e.created_at,
				papers: e.papers,
				kind: e.kind,
				note: e.note,
				stripe_session_id: e.stripe_session_id,
				stripe_invoice_id: e.stripe_invoice_id,
				grading_run_id: e.grading_run_id,
				period_id: e.period_id,
				granted_by_email: e.granted_by_user?.email ?? null,
			})),
			balance: balanceAgg._sum.papers ?? 0,
		}
	},
)
