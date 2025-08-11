import { Hono } from "hono"
import { compress } from "hono/compress"
import { HTTPException } from "hono/http-exception"
import { logger } from "hono/logger"

import { ErrorCodes, VisibleError } from "./error"

import { mcpRoutes } from "./mcp-routes"
import { Resource } from "sst"
import { cors } from "hono/cors"
import type { HonoEnv } from "./types"
import { apiRoutes } from "./api-routes"
import { authMiddleware } from "./auth/auth-middleware"

export const routes = new Hono<HonoEnv>()
	.use("*", cors())
	.use("*", logger())
	.use("*", compress())
	.use("/api/*", authMiddleware)
	.route("/api", apiRoutes)
	.use("/mcp/*", authMiddleware)
	.route("/mcp", mcpRoutes)
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
			issuer: Resource.AuthUrl.url, // TODO: replace with actual URL or dynamic value
			authorization_server: Resource.AuthUrl.url,
			token_endpoint: `${Resource.AuthUrl.url}/token`,
		})
	})
	.get("/.well-known/oauth-authorization-server", (c) => {
		return c.json({
			issuer: Resource.AuthUrl.url,
			authorization_endpoint: `${Resource.AuthUrl.url}/authorize`,
			token_endpoint: `${Resource.AuthUrl.url}/token`,
			introspection_endpoint: `${Resource.AuthUrl.url}/introspect`,
			response_types_supported: ["code"],
			// response_types_supported: ["code", "token"],
			grant_types_supported: ["authorization_code", "refresh_token"],
			scopes_supported: ["openid", "profile", "email"],
			token_endpoint_auth_methods_supported: ["none"], // or ["client_secret_post"] if you require client secrets
			introspection_endpoint_auth_methods_supported: ["none"], // Same as token endpoint for consistency
			registration_endpoint: `${Resource.AuthUrl.url}/register`, // Using Auth URL like other endpoints
		})
	})

export type AppType = typeof routes
