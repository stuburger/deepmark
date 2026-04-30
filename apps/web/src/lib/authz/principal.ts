// Pure module — no Prisma / SST imports. Loaders that need the DB live next
// to the resolution logic that consumes them (`effective-roles.ts`,
// `with-session.ts`).

import type { UserRole } from "@mcp-gcse/db"

export type AuthUser = {
	id: string
	email: string | null
	systemRole: UserRole
}

export function normaliseEmail(raw: string): string {
	return raw.trim().toLowerCase()
}
