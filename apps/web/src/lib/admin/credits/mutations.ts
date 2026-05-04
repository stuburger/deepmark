"use server"

import type { LedgerEntryKind } from "@mcp-gcse/db"
import { z } from "zod"

import { adminAction } from "@/lib/authz"
import { insertAdminGrant } from "@/lib/billing/ledger"
import { db } from "@/lib/db"

const grantInput = z.object({
	userId: z.string().min(1),
	papers: z
		.number()
		.int()
		.refine((n) => n !== 0, { message: "Papers must be non-zero" }),
	note: z.string().trim().max(500).optional(),
})

/**
 * Issue an admin paper grant to a user. Positive `papers` adds credit;
 * negative reverses a prior grant or compensates for an over-grant.
 *
 * Refuses to grant to admin users — they're already uncapped, and writing
 * ledger rows that don't affect entitlement just pollutes the table.
 */
export const grantPapersToUser = adminAction
	.inputSchema(grantInput)
	.action(
		async ({
			parsedInput: { userId, papers, note },
			ctx,
		}): Promise<{ ledgerEntryId: string; granted: number }> => {
			const target = await db.user.findUnique({
				where: { id: userId },
				select: { role: true, email: true },
			})
			if (!target) {
				throw new Error("User not found")
			}
			if (target.role === "admin") {
				throw new Error(
					"Admin users are uncapped — granting credits has no effect.",
				)
			}

			const row = await insertAdminGrant({
				userId,
				papers,
				grantedByUserId: ctx.user.id,
				note: note?.length ? note : undefined,
			})
			ctx.log.info("Admin paper grant issued", {
				targetUserId: userId,
				targetEmail: target.email,
				papers,
				note: note ?? null,
				ledgerEntryId: row.id,
			})
			return { ledgerEntryId: row.id, granted: papers }
		},
	)

const deleteEntryInput = z.object({
	entryId: z.string().min(1),
})

/**
 * Hard-delete a specific ledger entry. Primarily for fixture cleanup during
 * testing — for production refunds, prefer issuing a negative `admin_grant`
 * via `grantPapersToUser` (preserves audit trail).
 *
 * Logs the deleted row's full state so the admin log retains forensic
 * evidence even after the row is gone.
 */
export const deleteLedgerEntry = adminAction
	.inputSchema(deleteEntryInput)
	.action(
		async ({
			parsedInput: { entryId },
			ctx,
		}): Promise<{ deleted: { kind: LedgerEntryKind; papers: number } }> => {
			const entry = await db.paperLedgerEntry.findUnique({
				where: { id: entryId },
				select: {
					id: true,
					user_id: true,
					papers: true,
					kind: true,
					note: true,
					stripe_session_id: true,
					stripe_invoice_id: true,
					grading_run_id: true,
				},
			})
			if (!entry) {
				throw new Error("Ledger entry not found")
			}

			await db.paperLedgerEntry.delete({ where: { id: entryId } })
			ctx.log.warn("Admin ledger entry hard-deleted", {
				entryId,
				deletedRow: entry,
				deletedBy: ctx.user.id,
			})
			return { deleted: { kind: entry.kind, papers: entry.papers } }
		},
	)
