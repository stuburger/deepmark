import { AuthError } from "@/error"
import type { HonoEnv } from "@/types"
import type { MiddlewareHandler } from "hono/types"
import { Resource } from "sst"
import { createTokenVerifier } from "./create-token-verifier"

const tokenVerifier = createTokenVerifier()

export const authMiddleware: MiddlewareHandler<HonoEnv> = async (c, next) => {
	try {
		const authHeader = c.req.header("authorization")

		if (!authHeader) {
			throw new AuthError("Missing Authorization header", "invalid_request")
		}

		const [type, token] = authHeader.split(" ")
		if (type.toLowerCase() !== "bearer" || !token) {
			throw new AuthError(
				"Invalid Authorization header format, expected 'Bearer TOKEN'",
				"invalid_token",
			)
		}

		// Verify the token using the introspection endpoint
		const authInfo = await tokenVerifier.verifyAccessToken(token)

		// Store auth info in context for later use
		c.set("auth", authInfo)

		console.log("Token verified successfully for user", authInfo)

		await next()
	} catch (error) {
		if (error instanceof AuthError) {
			const wwwAuthValue = [
				`Bearer realm="MCP/API Server"`,
				`error="${error.errorCode}"`,
				`error_description="${error.message}"`,
				`resource_metadata_uri="${Resource.AuthUrl.url}/.well-known/oauth-protected-resource"`,
			]

			c.header("WWW-Authenticate", wwwAuthValue.join(", "))
			return c.json(error.toResponse(), error.statusCode as 401 | 403 | 500)
		}

		console.error("Unexpected auth error:", error)
		const authError = new AuthError(
			"Internal server error",
			"server_error",
			500,
		)
		c.header("WWW-Authenticate", `Bearer realm="MCP Server"`)
		return c.json(authError.toResponse(), 500)
	}
}
