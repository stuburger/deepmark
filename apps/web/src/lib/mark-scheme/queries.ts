"use server"

import { authenticatedAction } from "@/lib/authz"
import { db } from "@/lib/db"
import { z } from "zod"

/**
 * Loads `content` for each MarkScheme id in `ids`. Returns a Map keyed by id.
 *
 * Authorisation: this is an `authenticatedAction` rather than per-row
 * `resourceAction`/`resourcesAction` because callers reach this function
 * with mark-scheme ids derived from data they're already authz'd to see
 * (e.g. submission grading results, which gate viewer access on the parent
 * submission). Re-checking each id would be N round-trips with no security
 * gain. Do NOT call this with arbitrary client-supplied ids — only with
 * ids that flowed through a prior resource-authz check.
 */
export const getMarkSchemeContents = authenticatedAction
	.schema(z.object({ ids: z.array(z.string()) }))
	.action(
		async ({
			parsedInput: { ids },
		}): Promise<{ contents: Record<string, string | null> }> => {
			if (ids.length === 0) return { contents: {} }
			const rows = await db.markScheme.findMany({
				where: { id: { in: ids } },
				select: { id: true, content: true },
			})
			const contents: Record<string, string | null> = {}
			for (const r of rows) contents[r.id] = r.content
			return { contents }
		},
	)
