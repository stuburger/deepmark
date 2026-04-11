import { OpenAPIHono } from "@hono/zod-openapi"
import type { Context } from "hono"
import { compress } from "hono/compress"
import { HTTPException } from "hono/http-exception"
import { logger } from "hono/logger"

import { ErrorCodes, VisibleError } from "./error"

import { cors } from "hono/cors"
import { Resource } from "sst"
import { mcpRoutes } from "./mcp-routes"
import type { HonoEnv } from "./types"

import { swaggerUI } from "@hono/swagger-ui"
import { apiRoutes } from "./api-routes"
import { authMiddleware } from "./auth/auth-middleware"

export const v1Routes = new OpenAPIHono<HonoEnv>()
	.route("/v1", apiRoutes)
	.doc("/doc", {
		info: {
			title: `Audio Processing API (${Resource.App.stage})`,
			version: "v5",
		},
		servers: [{ url: `${Resource.ApiGateway.url}/v1` }],
		openapi: "3.1.0",
	})
	.get("/ui", swaggerUI({ url: "/v1/doc" }))

export const routes = new OpenAPIHono<HonoEnv>()
	.use("*", cors())
	.use("*", logger())
	.use("*", compress())
	.route("/mcp", mcpRoutes)
	.route("/v1", v1Routes.use(authMiddleware))

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
	// RFC 9728 Protected Resource Metadata — served at both paths:
	// - /.well-known/oauth-protected-resource        (base)
	// - /.well-known/oauth-protected-resource/mcp    (MCP clients append the resource path)
	.get("/.well-known/oauth-protected-resource", (c: Context) => {
		const origin = new URL(c.req.url).origin
		return c.json({
			resource: `${origin}/mcp`,
			authorization_servers: [Resource.AuthUrl.url],
		})
	})
	.get("/.well-known/oauth-protected-resource/mcp", (c: Context) => {
		const origin = new URL(c.req.url).origin
		return c.json({
			resource: `${origin}/mcp`,
			authorization_servers: [Resource.AuthUrl.url],
		})
	})
	.get("/.well-known/oauth-authorization-server", (c) => {
		return c.json({
			issuer: Resource.AuthUrl.url,
			authorization_endpoint: `${Resource.AuthUrl.url}/authorize`,
			token_endpoint: `${Resource.AuthUrl.url}/token`,
			introspection_endpoint: `${Resource.AuthUrl.url}/introspect`,
			response_types_supported: ["code"],
			grant_types_supported: ["authorization_code", "refresh_token"],
			scopes_supported: ["openid", "profile", "email"],
			token_endpoint_auth_methods_supported: ["none"],
			introspection_endpoint_auth_methods_supported: ["none"],
			registration_endpoint: `${Resource.AuthUrl.url}/register`,
		})
	})
	// Safety-net redirects: some MCP clients derive all OAuth URLs from the same
	// origin as the registration endpoint and ignore the well-known metadata.
	// These routes forward them to the real auth server transparently.
	.get("/authorize", (c) => {
		const params = new URL(c.req.url).searchParams.toString()
		return c.redirect(`${Resource.AuthUrl.url}/authorize?${params}`, 302)
	})
	.post("/token", async (c) => {
		const params = new URL(c.req.url).searchParams.toString()
		return c.redirect(`${Resource.AuthUrl.url}/token?${params}`, 307)
	})
	// RFC 7591 Dynamic Client Registration — fallback for clients that try the resource
	// server instead of the auth server. Returns the same client_id the auth server uses
	// so tokens issued against either endpoint are compatible. No network hop needed since
	// the auth server's registration is stateless (in-memory, resets per invocation).
	.post("/register", async (c) => {
		let body: Record<string, unknown> = {}
		try {
			body = await c.req.json()
		} catch {
			// empty body is valid per RFC 7591
		}
		const clientId = `${Resource.App.name}_${Resource.App.stage}`
		return c.json(
			{
				client_id: clientId,
				client_id_issued_at: Math.floor(Date.now() / 1000),
				redirect_uris: Array.isArray(body.redirect_uris)
					? body.redirect_uris
					: [],
				grant_types: ["authorization_code"],
				response_types: ["code"],
				token_endpoint_auth_method: "none",
			},
			201,
		)
	})

export type AppType = typeof routes
