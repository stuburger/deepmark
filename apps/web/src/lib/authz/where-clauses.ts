import { db } from "@/lib/db"
import {
	type Prisma,
	ResourceGrantResourceType,
	type ResourceGrantRole,
} from "@mcp-gcse/db"
import { type AuthUser, normaliseEmail } from "./principal"
import { rolesAtLeast } from "./roles"

function principalWhere(user: AuthUser): Prisma.ResourceGrantWhereInput[] {
	return [
		{ principal_user_id: user.id },
		...(user.email
			? [
					{
						principal_email: normaliseEmail(user.email),
					},
				]
			: []),
	]
}

export async function grantedResourceIds(
	user: AuthUser,
	resourceType: ResourceGrantResourceType,
	minimum: ResourceGrantRole,
): Promise<string[]> {
	const grants = await db.resourceGrant.findMany({
		where: {
			resource_type: resourceType,
			revoked_at: null,
			role: { in: rolesAtLeast(minimum) },
			OR: principalWhere(user),
		},
		select: { resource_id: true },
	})
	return grants.map((g) => g.resource_id)
}

export async function examPaperAccessWhere(
	user: AuthUser,
	minimum: ResourceGrantRole,
): Promise<Prisma.ExamPaperWhereInput> {
	if (user.systemRole === "admin") return {}
	const grantIds = await grantedResourceIds(
		user,
		ResourceGrantResourceType.exam_paper,
		minimum,
	)
	return {
		OR: [{ created_by_id: user.id }, { id: { in: grantIds } }],
	}
}

export async function submissionAccessWhere(
	user: AuthUser,
	minimum: ResourceGrantRole,
): Promise<Prisma.StudentSubmissionWhereInput> {
	if (user.systemRole === "admin") return {}
	const [paperIds, directSubmissionIds] = await Promise.all([
		grantedResourceIds(user, ResourceGrantResourceType.exam_paper, minimum),
		grantedResourceIds(
			user,
			ResourceGrantResourceType.student_submission,
			minimum,
		),
	])
	return {
		OR: [
			{ uploaded_by: user.id },
			{ exam_paper: { created_by_id: user.id } },
			{ exam_paper_id: { in: paperIds } },
			{ id: { in: directSubmissionIds } },
		],
	}
}

export async function readableExamPaperIdsForUser(
	user: AuthUser,
): Promise<string[]> {
	const accessWhere = await examPaperAccessWhere(user, "viewer")
	const papers = await db.examPaper.findMany({
		where: { is_active: true, ...accessWhere },
		select: { id: true },
	})
	return papers.map((p) => p.id)
}

export async function directlyGrantedSubmissionIdsForUser(
	user: AuthUser,
): Promise<string[]> {
	return grantedResourceIds(
		user,
		ResourceGrantResourceType.student_submission,
		"viewer",
	)
}
