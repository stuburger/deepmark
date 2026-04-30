export type SystemRole = "student" | "teacher" | "admin" | "examiner"

export type ResourceRole = "owner" | "editor" | "viewer"

export type ResourcePrincipal = {
	id: string
	email: string | null
	systemRole: SystemRole
}

export type ResourceGrantCandidate = {
	role: ResourceRole
	principalUserId: string | null
	principalEmail: string | null
}

const ROLE_RANK: Record<ResourceRole, number> = {
	owner: 3,
	editor: 2,
	viewer: 1,
}

export function normalisePrincipalEmail(raw: string): string {
	return raw.trim().toLowerCase()
}

export function resourceRoleRank(role: ResourceRole): number {
	return ROLE_RANK[role]
}

export function resourceRolesAtLeast(minimum: ResourceRole): ResourceRole[] {
	return (Object.keys(ROLE_RANK) as ResourceRole[]).filter((role) =>
		meetsResourceRole(role, minimum),
	)
}

export function maxResourceRole(
	a: ResourceRole | null,
	b: ResourceRole | null,
): ResourceRole | null {
	if (!a) return b
	if (!b) return a
	return resourceRoleRank(a) >= resourceRoleRank(b) ? a : b
}

export function meetsResourceRole(
	effective: ResourceRole | null,
	minimum: ResourceRole,
): boolean {
	if (!effective) return false
	return resourceRoleRank(effective) >= resourceRoleRank(minimum)
}

export function grantMatchesPrincipal(
	principal: ResourcePrincipal,
	grant: Pick<ResourceGrantCandidate, "principalUserId" | "principalEmail">,
): boolean {
	if (grant.principalUserId && grant.principalUserId === principal.id) {
		return true
	}
	if (!grant.principalEmail || !principal.email) return false
	return (
		normalisePrincipalEmail(grant.principalEmail) ===
		normalisePrincipalEmail(principal.email)
	)
}

export function maxMatchingGrantRole(
	principal: ResourcePrincipal,
	grants: ResourceGrantCandidate[],
): ResourceRole | null {
	return grants.reduce<ResourceRole | null>((best, grant) => {
		if (!grantMatchesPrincipal(principal, grant)) return best
		return maxResourceRole(best, grant.role)
	}, null)
}

export function effectiveExamPaperResourceRole({
	principal,
	ownerUserId,
	grants,
}: {
	principal: ResourcePrincipal
	ownerUserId: string
	grants: ResourceGrantCandidate[]
}): ResourceRole | null {
	if (principal.systemRole === "admin") return "owner"
	const ownerFallback: ResourceRole | null =
		ownerUserId === principal.id ? "owner" : null
	return maxResourceRole(ownerFallback, maxMatchingGrantRole(principal, grants))
}

export function effectiveSubmissionResourceRole({
	principal,
	uploadedByUserId,
	parentExamPaperRole,
	grants,
}: {
	principal: ResourcePrincipal
	uploadedByUserId: string
	parentExamPaperRole: ResourceRole | null
	grants: ResourceGrantCandidate[]
}): ResourceRole | null {
	if (principal.systemRole === "admin") return "owner"
	const ownerFallback: ResourceRole | null =
		uploadedByUserId === principal.id ? "owner" : null
	return maxResourceRole(
		maxResourceRole(ownerFallback, parentExamPaperRole),
		maxMatchingGrantRole(principal, grants),
	)
}

export function removingOrDowngradingFinalOwner({
	currentRole,
	nextRole,
	activeOwnerCount,
}: {
	currentRole: ResourceRole
	nextRole: ResourceRole | null
	activeOwnerCount: number
}): boolean {
	return (
		currentRole === "owner" && nextRole !== "owner" && activeOwnerCount <= 1
	)
}
