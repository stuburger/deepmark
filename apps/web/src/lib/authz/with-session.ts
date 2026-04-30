import { auth } from "@/lib/auth"
import { loadAuthUser } from "./effective-roles"
import type { AuthUser } from "./principal"

export async function requireSessionUser(): Promise<
	{ ok: true; user: AuthUser } | { ok: false; error: string }
> {
	const session = await auth()

	if (!session) return { ok: false, error: "Not authenticated" }

	const user = await loadAuthUser(session.userId)

	if (!user) return { ok: false, error: "User not found" }

	return { ok: true, user }
}
