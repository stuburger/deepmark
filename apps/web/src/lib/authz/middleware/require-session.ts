import { auth } from "@/lib/auth"
import { loadAuthUser } from "../effective-roles"
import { AuthRequiredError } from "../errors"
import type { AuthUser } from "../principal"

/**
 * Resolves the current user from the OpenAuth session cookie. Throws
 * AuthRequiredError when no valid session exists. The next middleware in the
 * chain receives `ctx.user`.
 *
 * Exposed as a plain function so it can be reused by the route-handler wrapper
 * in addition to the action client.
 */
export async function resolveSessionUser(): Promise<AuthUser> {
	const session = await auth()
	if (!session) throw new AuthRequiredError()
	const user = await loadAuthUser(session.userId)
	if (!user) throw new AuthRequiredError("User account not found")
	return user
}
