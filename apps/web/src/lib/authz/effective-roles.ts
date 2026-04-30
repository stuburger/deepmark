import { db } from "@/lib/db"
import { ResourceGrantResourceType, type ResourceGrantRole } from "@mcp-gcse/db"
import {
	type ResourceGrantRepository,
	effectiveExamPaperResourceRole,
	effectiveSubmissionResourceRole,
} from "@mcp-gcse/shared"
import type { AuthUser } from "./principal"

export async function loadAuthUser(userId: string): Promise<AuthUser | null> {
	const row = await db.user.findUnique({
		where: { id: userId },
		select: { id: true, email: true, role: true },
	})
	if (!row) return null
	return {
		id: row.id,
		email: row.email,
		systemRole: row.role,
	}
}

/**
 * Web-side implementation of the shared ResourceGrantRepository contract.
 * The backend collab Lambda has its own implementation against its own Prisma
 * client; both bind to the same shape so drift is caught at the type level.
 */
export const loadResourceGrants: ResourceGrantRepository["loadResourceGrants"] =
	async (resourceType, resourceId) => {
		const rows = await db.resourceGrant.findMany({
			where: {
				resource_type: resourceType as ResourceGrantResourceType,
				resource_id: resourceId,
				revoked_at: null,
			},
			select: {
				role: true,
				principal_user_id: true,
				principal_email: true,
			},
		})
		return rows.map((row) => ({
			role: row.role,
			principalUserId: row.principal_user_id,
			principalEmail: row.principal_email,
		}))
	}

export async function effectiveExamPaperRole(
	user: AuthUser,
	examPaperId: string,
): Promise<ResourceGrantRole | null> {
	const paper = await db.examPaper.findUnique({
		where: { id: examPaperId },
		select: { created_by_id: true },
	})
	if (!paper) return null

	const grants = await loadResourceGrants(
		ResourceGrantResourceType.exam_paper,
		examPaperId,
	)
	return effectiveExamPaperResourceRole({
		principal: {
			id: user.id,
			email: user.email,
			systemRole: user.systemRole,
		},
		ownerUserId: paper.created_by_id,
		grants,
	})
}

export async function effectiveSubmissionRole(
	user: AuthUser,
	submissionId: string,
): Promise<ResourceGrantRole | null> {
	const sub = await db.studentSubmission.findUnique({
		where: { id: submissionId },
		select: { exam_paper_id: true, uploaded_by: true },
	})
	if (!sub) return null

	const [paperRole, grants] = await Promise.all([
		effectiveExamPaperRole(user, sub.exam_paper_id),
		loadResourceGrants(
			ResourceGrantResourceType.student_submission,
			submissionId,
		),
	])
	return effectiveSubmissionResourceRole({
		principal: {
			id: user.id,
			email: user.email,
			systemRole: user.systemRole,
		},
		uploadedByUserId: sub.uploaded_by,
		parentExamPaperRole: paperRole,
		grants,
	})
}
