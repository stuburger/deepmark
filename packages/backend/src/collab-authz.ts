import { createPrismaClient } from "@mcp-gcse/db"
import type { UserRole } from "@mcp-gcse/db"
import {
	type ResourceGrantRepository,
	type ResourceRole,
	effectiveExamPaperResourceRole,
	effectiveSubmissionResourceRole,
} from "@mcp-gcse/shared"
import { parseDocumentName } from "@mcp-gcse/shared/collab"
import type {
	APIGatewayProxyHandlerV2,
	APIGatewayProxyStructuredResultV2,
} from "aws-lambda"
import { Resource } from "sst"
import { z } from "zod"

const BodySchema = z.object({
	userId: z.string().min(1),
	documentName: z.string().min(1),
})

type AuthUser = {
	id: string
	email: string | null
	systemRole: UserRole
}

type ExamPaperAccessRow = {
	ownerUserId: string
}

type SubmissionAccessRow = {
	uploadedByUserId: string
	examPaperId: string
}

export type CollabAuthzRepository = ResourceGrantRepository & {
	loadUser(userId: string): Promise<AuthUser | null>
	loadSubmission(submissionId: string): Promise<SubmissionAccessRow | null>
	loadExamPaper(examPaperId: string): Promise<ExamPaperAccessRow | null>
}

function createPrismaCollabAuthzRepository(): CollabAuthzRepository {
	const db = createPrismaClient(Resource.NeonPostgres.databaseUrl)
	return {
		async loadUser(userId) {
			const user = await db.user.findUnique({
				where: { id: userId },
				select: { id: true, email: true, role: true },
			})
			if (!user) return null
			return { id: user.id, email: user.email, systemRole: user.role }
		},
		async loadSubmission(submissionId) {
			const submission = await db.studentSubmission.findUnique({
				where: { id: submissionId },
				select: { uploaded_by: true, exam_paper_id: true },
			})
			if (!submission) return null
			return {
				uploadedByUserId: submission.uploaded_by,
				examPaperId: submission.exam_paper_id,
			}
		},
		async loadExamPaper(examPaperId) {
			const paper = await db.examPaper.findUnique({
				where: { id: examPaperId },
				select: { created_by_id: true },
			})
			if (!paper) return null
			return { ownerUserId: paper.created_by_id }
		},
		async loadResourceGrants(resourceType, resourceId) {
			const grants = await db.resourceGrant.findMany({
				where: {
					resource_type: resourceType,
					resource_id: resourceId,
					revoked_at: null,
				},
				select: { role: true, principal_user_id: true, principal_email: true },
			})
			return grants.map((grant) => ({
				role: grant.role,
				principalUserId: grant.principal_user_id,
				principalEmail: grant.principal_email,
			}))
		},
	}
}

async function resolveExamPaperRole(
	repository: CollabAuthzRepository,
	user: AuthUser,
	examPaperId: string,
): Promise<ResourceRole | null> {
	const paper = await repository.loadExamPaper(examPaperId)
	if (!paper) return null
	const grants = await repository.loadResourceGrants("exam_paper", examPaperId)
	return effectiveExamPaperResourceRole({
		principal: user,
		ownerUserId: paper.ownerUserId,
		grants,
	})
}

async function resolveSubmissionRole(
	repository: CollabAuthzRepository,
	user: AuthUser,
	submissionId: string,
): Promise<ResourceRole | null> {
	const submission = await repository.loadSubmission(submissionId)
	if (!submission) return null

	const [paperRole, directGrants] = await Promise.all([
		resolveExamPaperRole(repository, user, submission.examPaperId),
		repository.loadResourceGrants("student_submission", submissionId),
	])
	return effectiveSubmissionResourceRole({
		principal: user,
		uploadedByUserId: submission.uploadedByUserId,
		parentExamPaperRole: paperRole,
		grants: directGrants,
	})
}

/**
 * Resolves the user's effective role on the addressed collab document.
 *
 * Returns the role on success — collab-server uses it to decide whether to
 * flip the connection to read-only (viewer) vs read-write (editor / owner).
 * Doc viewers must still be able to load the doc to read it; rejecting them
 * outright would brick the standalone submission view for any submission
 * shared with `viewer` access.
 */
export async function authorizeCollabDocumentAccess(
	repository: CollabAuthzRepository,
	input: z.infer<typeof BodySchema>,
): Promise<
	{ ok: true; role: ResourceRole } | { ok: false; status: 403 | 404 }
> {
	const document = parseDocumentName(input.documentName)
	if (!document || document.kind !== "submission") {
		return { ok: false, status: 404 }
	}

	const user = await repository.loadUser(input.userId)
	if (!user) return { ok: false, status: 403 }

	const role = await resolveSubmissionRole(repository, user, document.id)
	if (role === null) return { ok: false, status: 403 }

	return { ok: true, role }
}

function response(
	statusCode: number,
	body: string,
): APIGatewayProxyStructuredResultV2 {
	return {
		statusCode,
		body,
		headers: { "Content-Type": "text/plain" },
	}
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
	const token = event.headers.authorization?.replace(/^Bearer\s+/i, "")
	if (token !== Resource.CollabServiceSecret.value) {
		return response(401, "Unauthorized")
	}

	let rawBody: unknown = null
	try {
		rawBody = event.body ? JSON.parse(event.body) : null
	} catch {
		return response(400, "Bad request")
	}

	const parsed = BodySchema.safeParse(rawBody)
	if (!parsed.success) return response(400, "Bad request")

	const authorized = await authorizeCollabDocumentAccess(
		createPrismaCollabAuthzRepository(),
		parsed.data,
	)
	if (!authorized.ok) {
		return response(
			authorized.status,
			authorized.status === 404 ? "Not found" : "Forbidden",
		)
	}

	return {
		statusCode: 200,
		body: JSON.stringify({ ok: true, role: authorized.role }),
		headers: { "Content-Type": "application/json" },
	}
}
