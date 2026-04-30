import type { ResourceGrantRole } from "@mcp-gcse/db"
import {
	maxResourceRole,
	meetsResourceRole,
	resourceRoleRank,
	resourceRolesAtLeast,
} from "@mcp-gcse/shared"

export function roleRank(role: ResourceGrantRole): number {
	return resourceRoleRank(role)
}

export function maxGrantRole(
	a: ResourceGrantRole | null,
	b: ResourceGrantRole | null,
): ResourceGrantRole | null {
	return maxResourceRole(a, b)
}

export function meetsMinimum(
	effective: ResourceGrantRole | null,
	minimum: ResourceGrantRole,
): boolean {
	return meetsResourceRole(effective, minimum)
}

export function rolesAtLeast(minimum: ResourceGrantRole): ResourceGrantRole[] {
	return resourceRolesAtLeast(minimum)
}
