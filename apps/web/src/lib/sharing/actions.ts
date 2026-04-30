"use server"

import {
	authenticatedAction,
	normaliseEmail,
	resourceAction,
	resourcesAction,
} from "@/lib/authz"
import { db } from "@/lib/db"
import {
	type ResourceGrant,
	ResourceGrantPrincipalType,
	ResourceGrantResourceType,
	type ResourceGrantRole,
} from "@mcp-gcse/db"
import { removingOrDowngradingFinalOwner } from "@mcp-gcse/shared"
import { z } from "zod"

export type ResourceGrantListItem = {
	id: string
	resource_type: ResourceGrantResourceType
	resource_id: string
	principal_user_id: string | null
	principal_email: string | null
	principal_name: string | null
	principal_avatar_url: string | null
	role: ResourceGrantRole
	pending: boolean
	created_at: Date
	accepted_at: Date | null
}

const resourceTypeEnum = z.enum(["exam_paper", "student_submission"])
const roleEnum = z.enum(["owner", "editor", "viewer"])

function uniqueNormalisedEmails(emails: string[]): string[] {
	return [...new Set(emails.map(normaliseEmail).filter(Boolean))]
}

async function lastActiveOwnerGrant(grant: ResourceGrant): Promise<boolean> {
	if (grant.role !== "owner" || grant.revoked_at) return false
	const ownerCount = await db.resourceGrant.count({
		where: {
			resource_type: grant.resource_type,
			resource_id: grant.resource_id,
			role: "owner",
			revoked_at: null,
		},
	})
	return removingOrDowngradingFinalOwner({
		currentRole: grant.role,
		nextRole: null,
		activeOwnerCount: ownerCount,
	})
}

// ─── shareResourceWithEmails ────────────────────────────────────────────────

const shareResourceInput = z.object({
	resourceType: resourceTypeEnum,
	resourceId: z.string(),
	emails: z
		.array(z.string().email())
		.min(1, "Enter at least one email address"),
	role: roleEnum,
})

export const shareResourceWithEmails = resourcesAction({
	schema: shareResourceInput,
	resources: [
		{
			type: "examPaper",
			role: "owner",
			ids: (i) => (i.resourceType === "exam_paper" ? [i.resourceId] : []),
		},
		{
			type: "submission",
			role: "owner",
			ids: (i) =>
				i.resourceType === "student_submission" ? [i.resourceId] : [],
		},
	],
}).action(
	async ({
		parsedInput: { resourceType, resourceId, emails, role },
		ctx,
	}): Promise<{ grantIds: string[] }> => {
		const normalised = uniqueNormalisedEmails(emails)
		if (normalised.length === 0) {
			throw new Error("Enter at least one email address")
		}

		const users = await db.user.findMany({
			where: { email: { in: normalised } },
			select: { id: true, email: true },
		})
		const userByEmail = new Map(
			users
				.filter((user) => user.email)
				.map((user) => [normaliseEmail(user.email ?? ""), user]),
		)

		const grantIds: string[] = []
		for (const email of normalised) {
			const principal = userByEmail.get(email)
			const existing = await db.resourceGrant.findFirst({
				where: {
					resource_type: resourceType,
					resource_id: resourceId,
					revoked_at: null,
					OR: [
						...(principal ? [{ principal_user_id: principal.id }] : []),
						{ principal_email: email },
					],
				},
				select: { id: true },
			})

			if (existing) {
				await db.resourceGrant.update({
					where: { id: existing.id },
					data: {
						role,
						principal_user_id: principal?.id ?? null,
						principal_email: email,
						accepted_at: principal ? new Date() : null,
					},
				})
				grantIds.push(existing.id)
				continue
			}

			const grant = await db.resourceGrant.create({
				data: {
					resource_type: resourceType,
					resource_id: resourceId,
					principal_type: ResourceGrantPrincipalType.user,
					principal_user_id: principal?.id ?? null,
					principal_email: email,
					role,
					created_by: ctx.user.id,
					accepted_at: principal ? new Date() : null,
				},
				select: { id: true },
			})
			grantIds.push(grant.id)
		}

		return { grantIds }
	},
)

// ─── listResourceGrants ─────────────────────────────────────────────────────

const listGrantsInput = z.object({
	resourceType: resourceTypeEnum,
	resourceId: z.string(),
})

export const listResourceGrants = resourcesAction({
	schema: listGrantsInput,
	resources: [
		{
			type: "examPaper",
			role: "viewer",
			ids: (i) => (i.resourceType === "exam_paper" ? [i.resourceId] : []),
		},
		{
			type: "submission",
			role: "viewer",
			ids: (i) =>
				i.resourceType === "student_submission" ? [i.resourceId] : [],
		},
	],
}).action(
	async ({
		parsedInput: { resourceType, resourceId },
	}): Promise<{ grants: ResourceGrantListItem[] }> => {
		const grants = await db.resourceGrant.findMany({
			where: {
				resource_type: resourceType,
				resource_id: resourceId,
				revoked_at: null,
			},
			orderBy: [{ role: "asc" }, { created_at: "asc" }],
			include: {
				principal_user: {
					select: { name: true, email: true, avatar_url: true },
				},
			},
		})

		return {
			grants: grants.map((grant) => ({
				id: grant.id,
				resource_type: grant.resource_type,
				resource_id: grant.resource_id,
				principal_user_id: grant.principal_user_id,
				principal_email:
					grant.principal_email ?? grant.principal_user?.email ?? null,
				principal_name: grant.principal_user?.name ?? null,
				principal_avatar_url: grant.principal_user?.avatar_url ?? null,
				role: grant.role,
				pending: grant.principal_user_id === null,
				created_at: grant.created_at,
				accepted_at: grant.accepted_at,
			})),
		}
	},
)

// ─── updateResourceGrantRole / revokeResourceGrant ──────────────────────────
//
// These act on a grant record by id. Authz requires loading the grant first to
// know its resource — so we do the load + assert inside the handler rather
// than via a static spec. We use authenticatedAction and assert manually.

const updateGrantInput = z.object({ grantId: z.string(), role: roleEnum })

export const updateResourceGrantRole = authenticatedAction
	.inputSchema(updateGrantInput)
	.action(
		async ({ parsedInput: { grantId, role }, ctx }): Promise<{ ok: true }> => {
			const grant = await db.resourceGrant.findUnique({
				where: { id: grantId },
			})
			if (!grant || grant.revoked_at) throw new Error("Grant not found")
			await assertOwnerByGrant(ctx.user, grant)

			const activeOwnerCount =
				grant.role === "owner"
					? await db.resourceGrant.count({
							where: {
								resource_type: grant.resource_type,
								resource_id: grant.resource_id,
								role: "owner",
								revoked_at: null,
							},
						})
					: 0
			if (
				removingOrDowngradingFinalOwner({
					currentRole: grant.role,
					nextRole: role,
					activeOwnerCount,
				})
			) {
				throw new Error("Cannot downgrade the final owner")
			}
			await db.resourceGrant.update({ where: { id: grantId }, data: { role } })
			return { ok: true }
		},
	)

const revokeGrantInput = z.object({ grantId: z.string() })

export const revokeResourceGrant = authenticatedAction
	.inputSchema(revokeGrantInput)
	.action(async ({ parsedInput: { grantId }, ctx }): Promise<{ ok: true }> => {
		const grant = await db.resourceGrant.findUnique({ where: { id: grantId } })
		if (!grant || grant.revoked_at) throw new Error("Grant not found")
		await assertOwnerByGrant(ctx.user, grant)
		if (await lastActiveOwnerGrant(grant)) {
			throw new Error("Cannot remove the final owner")
		}
		await db.resourceGrant.update({
			where: { id: grantId },
			data: { revoked_at: new Date() },
		})
		return { ok: true }
	})

async function assertOwnerByGrant(
	user: { id: string; systemRole: string },
	grant: ResourceGrant,
): Promise<void> {
	const { AccessDeniedError, assertExamPaperAccess, assertSubmissionAccess } =
		await import("@/lib/authz")
	const principal = await db.user.findUnique({
		where: { id: user.id },
		select: { id: true, email: true, role: true },
	})
	if (!principal) throw new AccessDeniedError("User not found")
	const access =
		grant.resource_type === ResourceGrantResourceType.exam_paper
			? await assertExamPaperAccess(
					{
						id: principal.id,
						email: principal.email,
						systemRole: principal.role,
					},
					grant.resource_id,
					"owner",
				)
			: await assertSubmissionAccess(
					{
						id: principal.id,
						email: principal.email,
						systemRole: principal.role,
					},
					grant.resource_id,
					"owner",
				)
	if (!access.ok) throw new AccessDeniedError(access.error)
}

// ─── shareSubmissionsWithEmails ─────────────────────────────────────────────

const shareSubsInput = z.object({
	submissionIds: z.array(z.string()).min(1),
	emails: z.array(z.string().email()).min(1),
	role: roleEnum,
})

export const shareSubmissionsWithEmails = resourcesAction({
	schema: shareSubsInput,
	resources: [
		{
			type: "submission",
			role: "owner",
			ids: (i) => i.submissionIds,
		},
	],
}).action(
	async ({
		parsedInput: { submissionIds, emails, role },
		ctx,
	}): Promise<{ grantIds: string[] }> => {
		const grantIds: string[] = []
		for (const submissionId of submissionIds) {
			const result = await shareResourceWithEmails({
				resourceType: "student_submission",
				resourceId: submissionId,
				emails,
				role,
			})
			if (result?.serverError) throw new Error(result.serverError)
			if (result?.data?.grantIds) grantIds.push(...result.data.grantIds)
		}
		ctx.log.info("submissions shared", { count: submissionIds.length })
		return { grantIds }
	},
)

// ─── listSubmissionGrants ───────────────────────────────────────────────────

export const listSubmissionGrants = resourceAction({
	type: "submission",
	role: "viewer",
	schema: z.object({ submissionId: z.string() }),
	id: ({ submissionId }) => submissionId,
}).action(
	async ({
		parsedInput: { submissionId },
	}): Promise<{ grants: ResourceGrantListItem[] }> => {
		const grants = await db.resourceGrant.findMany({
			where: {
				resource_type: ResourceGrantResourceType.student_submission,
				resource_id: submissionId,
				revoked_at: null,
			},
			orderBy: [{ role: "asc" }, { created_at: "asc" }],
			include: {
				principal_user: {
					select: { name: true, email: true, avatar_url: true },
				},
			},
		})

		return {
			grants: grants.map((grant) => ({
				id: grant.id,
				resource_type: grant.resource_type,
				resource_id: grant.resource_id,
				principal_user_id: grant.principal_user_id,
				principal_email:
					grant.principal_email ?? grant.principal_user?.email ?? null,
				principal_name: grant.principal_user?.name ?? null,
				principal_avatar_url: grant.principal_user?.avatar_url ?? null,
				role: grant.role,
				pending: grant.principal_user_id === null,
				created_at: grant.created_at,
				accepted_at: grant.accepted_at,
			})),
		}
	},
)
