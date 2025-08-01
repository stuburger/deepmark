import { Hono } from "hono"
import { compress } from "hono/compress"
import { HTTPException } from "hono/http-exception"
import { logger } from "hono/logger"

import { ErrorCodes, VisibleError } from "./error"

import { route } from "./routes"
import { Resource } from "sst"
import { z } from "zod"
import { cors } from "hono/cors"
import type { HonoVariables } from "./types"
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js"

const clientRegistrations = new Map()

class AuthError extends Error {
	constructor(
		message: string,
		public errorCode: string,
		public statusCode = 401,
	) {
		super(message)
	}

	toResponse() {
		return {
			error: this.errorCode,
			error_description: this.message,
		}
	}
}

// Token verifier that uses the introspection endpoint
const createTokenVerifier = () => {
	return {
		verifyAccessToken: async (token: string): Promise<AuthInfo> => {
			const introspectEndpoint = `${Resource.Auth.url}/introspect`

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

				return {
					token,
					clientId: data.client_id,
					scopes: data.scope ? data.scope.split(" ") : [],
					expiresAt: data.exp,
					// resource: todo
					extra: { userId: data.sub },
				}
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

const tokenVerifier = createTokenVerifier()

const OAuthRegistrationSchema = z.object({
	redirect_uris: z.array(z.string().url()).optional(),
	client_name: z.string().optional(),
	client_uri: z.string().url().optional(),
	logo_uri: z.string().url().optional(),
	scope: z.string().optional(),
	grant_types: z.array(z.string()).optional(),
	response_types: z.array(z.string()).optional(),
	token_endpoint_auth_method: z.string().optional(),
})

export const routes = new Hono<{ Variables: HonoVariables }>()
	.use("*", async (c, next) => {
		let body: unknown = undefined
		try {
			// Try to parse as JSON
			body = await c.req.json()
		} catch (e) {
			try {
				// Try to parse as text if not JSON
				body = await c.req.text()
			} catch (e2) {
				body = undefined
			}
		}
		console.log("[Request Body]", body)
		await next()
	})
	.use("*", cors())
	.use("*", logger())
	.use("*", compress())
	.use("*", async (c, next) => {
		await next()
		if (!c.res.headers.get("cache-control")) {
			c.header(
				"cache-control",
				"no-store, max-age=0, must-revalidate, no-cache",
			)
		}
	})
	.use("/mcp/*", async (c, next) => {
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
				const wwwAuthValue = `Bearer realm="MCP Server", error="${error.errorCode}", error_description="${error.message}", resource_metadata_uri="${Resource.Auth.url}/.well-known/oauth-protected-resource"`

				c.header("WWW-Authenticate", wwwAuthValue)
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
	})
	.route("/mcp", route)
	.onError((error, c) => {
		if (error instanceof VisibleError) {
			// @ts-expect-error
			return c.json(error.toResponse(), error.statusCode())
		}

		if (error instanceof HTTPException) {
			console.error("http error:", error)
			return c.json(
				{
					type: "validation",
					code: ErrorCodes.Validation.INVALID_PARAMETER,
					message: "Invalid request",
				},
				400,
			)
		}

		console.error("unhandled error:", error)
		return c.json(
			{
				type: "internal",
				code: ErrorCodes.Server.INTERNAL_ERROR,
				message: "Internal server error",
			},
			500,
		)
	})
	.get("/.well-known/oauth-protected-resource", (c) => {
		// --- OAUTH DISCOVERY ENDPOINTS ---
		return c.json({
			issuer: Resource.Auth.url, // TODO: replace with actual URL or dynamic value
			authorization_server: Resource.Auth.url,
			token_endpoint: `${Resource.Auth.url}/auth/token`,
		})
	})
	.get("/.well-known/oauth-authorization-server", (c) => {
		return c.json({
			issuer: Resource.Auth.url,
			authorization_endpoint: `${Resource.Auth.url}/authorize`,
			token_endpoint: `${Resource.Auth.url}/token`,
			introspection_endpoint: `${Resource.Auth.url}/introspect`,
			response_types_supported: ["code"],
			// response_types_supported: ["code", "token"],
			grant_types_supported: ["authorization_code", "refresh_token"],
			scopes_supported: ["openid", "profile", "email"],
			token_endpoint_auth_methods_supported: ["none"], // or ["client_secret_post"] if you require client secrets
			introspection_endpoint_auth_methods_supported: ["none"], // Same as token endpoint for consistency
			registration_endpoint: `${Resource.Auth.url}/register`, // Using Auth URL like other endpoints
		})
	})
	.post("/register", async (c) => {
		try {
			console.log("Received client registration request")
			const body = await c.req.json()
			console.log("Registration request body:", body)

			// Validate the registration request according to RFC 7591

			const validatedData = OAuthRegistrationSchema.parse(body)
			console.log("Validated registration data:", validatedData)

			// Generate a unique client_id and client_secret
			const client_id = `client_${Date.now()}_${Math.random()
				.toString(36)
				.substr(2, 9)}`
			const client_secret = Math.random().toString(36).substr(2, 15)
			console.log("Generated client_id:", client_id)

			// Store the client registration (you might want to use a database here)
			const clientRegistration = {
				client_id,
				client_secret,
				client_id_issued_at: Math.floor(Date.now() / 1000),
				client_secret_expires_at: 0, // 0 means no expiration
				...validatedData,
			}

			clientRegistrations.set(client_id, clientRegistration)

			console.log("Stored client registration for client_id:", client_id)

			c.header("Access-Control-Allow-Origin", "*")
			c.header("Access-Control-Allow-Methods", "POST, OPTIONS")
			c.header("Access-Control-Allow-Headers", "Content-Type, Authorization")

			console.log("Returning response with status 201")
			const response = c.json(clientRegistration, 201)
			console.log("Response created:", response)
		} catch (error) {
			console.error("Error processing registration request:", error)
			return c.json(
				{
					error: "invalid_request",
					error_description: "Invalid registration request",
				},
				400,
				{
					"Access-Control-Allow-Origin": "*",
					"Access-Control-Allow-Methods": "POST, OPTIONS",
					"Access-Control-Allow-Headers": "Content-Type, Authorization",
				},
			)
		}
	})

export type AppType = typeof routes
