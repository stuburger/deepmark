import { Resource } from "sst"
import { z } from "zod"

const IntrospectResponse = z.object({
	active: z.boolean(),
	sub: z.string().optional(),
	exp: z.number().optional(),
	scope: z.string().optional(),
	client_id: z.string().optional(),
})

export type VerifiedClaims = {
	userId: string
	role: "user" | "service"
	expiresAt: number | undefined
}

export class AuthFailure extends Error {
	constructor(message: string) {
		super(message)
		this.name = "AuthFailure"
	}
}

/**
 * Verifies a bearer token presented over the Hocuspocus connection.
 *
 * Two paths:
 *   1. Service token — exact match against Resource.CollabServiceSecret.
 *      Used by backend Lambdas that need to write to Y.Doc bypassing per-user
 *      ACL. No round-trip to OpenAuth.
 *   2. User token — forwarded to OpenAuth's /introspect endpoint for
 *      cryptographic verification. Returns userId for per-submission ACL
 *      (not yet implemented — see TODO in index.ts).
 */
export async function verifyOpenAuthToken(
	token: string,
): Promise<VerifiedClaims> {
	if (token === Resource.CollabServiceSecret.value) {
		return { userId: "service", role: "service", expiresAt: undefined }
	}

	const res = await fetch(`${Resource.AuthUrl.url}/introspect`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ token }),
	})

	if (!res.ok) {
		throw new AuthFailure(`introspect returned ${res.status}`)
	}

	const parsed = IntrospectResponse.parse(await res.json())

	if (!parsed.active) throw new AuthFailure("token not active")
	if (parsed.exp && parsed.exp < Date.now() / 1000)
		throw new AuthFailure("token expired")
	if (!parsed.sub) throw new AuthFailure("token missing sub claim")

	return { userId: parsed.sub, role: "user", expiresAt: parsed.exp }
}
