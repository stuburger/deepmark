import { AccessDeniedError } from "../errors"
import type { AuthUser } from "../principal"

export function requireAdminUser(user: AuthUser): void {
	if (user.systemRole !== "admin") {
		throw new AccessDeniedError("Admin access required")
	}
}
