"use server"

import { authenticatedAction } from "@/lib/authz"
import { db } from "@/lib/db"
import { z } from "zod"

export type SessionState =
	| { status: "extracting"; createdAt: Date }
	| { status: "failed"; error: string | null; createdAt: Date }
	| { status: "completed"; examPaperId: string; createdAt: Date }

const getInput = z.object({ sessionId: z.string() })

/**
 * Reads a PaperSetupSession's status for the wizard live view. Access is
 * gated on ownership — sessions aren't shared.
 */
export const getPaperSetupSession = authenticatedAction
	.inputSchema(getInput)
	.action(
		async ({
			parsedInput: { sessionId },
			ctx,
		}): Promise<{ session: SessionState | null }> => {
			const row = await db.paperSetupSession.findFirst({
				where: { id: sessionId, created_by_id: ctx.user.id },
				select: {
					status: true,
					exam_paper_id: true,
					error: true,
					created_at: true,
				},
			})
			if (!row) return { session: null }

			if (row.status === "completed" && row.exam_paper_id) {
				return {
					session: {
						status: "completed",
						examPaperId: row.exam_paper_id,
						createdAt: row.created_at,
					},
				}
			}
			if (row.status === "failed") {
				return {
					session: {
						status: "failed",
						error: row.error,
						createdAt: row.created_at,
					},
				}
			}
			return {
				session: { status: "extracting", createdAt: row.created_at },
			}
		},
	)
