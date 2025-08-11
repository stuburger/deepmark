import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js"
import { Resource } from "sst"
import { AuthError } from "../error"
import z from "zod"

export const AuthInfoSchema = z.object({
	token: z.string(),
	clientId: z.string(),
	scopes: z.array(z.string()),
	expiresAt: z.number().optional(),
	extra: z.object({
		userId: z.string(),
	}),
})

// Token verifier that uses the introspection endpoint
export const createTokenVerifier = () => {
	return {
		verifyAccessToken: async (
			token: string,
		): Promise<AuthInfo & { extra: { userId: string } }> => {
			const introspectEndpoint = `${Resource.AuthUrl.url}/introspect`

			try {
				const response = await fetch(introspectEndpoint, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({ token }),
				})

				if (!response.ok) {
					throw new AuthError("Token verification failed", "invalid_token", 401)
				}

				const data = await response.json()

				// Check if token is active
				if (!data.active) {
					throw new AuthError("Token is not active", "invalid_token", 401)
				}

				// Check if token is expired
				if (data.exp && data.exp < Date.now() / 1000) {
					throw new AuthError("Token has expired", "invalid_token", 401)
				}

				return AuthInfoSchema.parse({
					token,
					clientId: data.client_id,
					scopes: data.scope ? data.scope.split(" ") : [],
					expiresAt: data.exp,
					// resource: todo
					extra: { userId: data.sub },
				})
			} catch (error) {
				if (error instanceof AuthError) {
					throw error
				}
				console.error("Token verification error:", error)
				throw new AuthError(
					"Internal error during token verification",
					"server_error",
					500,
				)
			}
		},
	}
}
