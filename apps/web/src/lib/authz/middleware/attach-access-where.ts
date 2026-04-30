import type { Prisma, ResourceGrantRole } from "@mcp-gcse/db"
import type { AuthUser } from "../principal"
import { examPaperAccessWhere, submissionAccessWhere } from "../where-clauses"

export type AccessWhereScope = "examPaper" | "submission"

export type AccessWhereResult = {
	examPaper: Prisma.ExamPaperWhereInput
	submission: Prisma.StudentSubmissionWhereInput
}

/**
 * Resolves the Prisma where-clause for a list query scoped to the current user.
 * The where-clause is the empty object for admins (system-wide read), and an
 * explicit OR list for everyone else: own-created + grants on the resource +
 * (for submissions) grants on the parent paper.
 */
export async function resolveAccessWhere<S extends AccessWhereScope>(
	user: AuthUser,
	scope: S,
	minimum: ResourceGrantRole,
): Promise<AccessWhereResult[S]> {
	if (scope === "examPaper") {
		const where = await examPaperAccessWhere(user, minimum)
		return where as AccessWhereResult[S]
	}
	const where = await submissionAccessWhere(user, minimum)
	return where as AccessWhereResult[S]
}
