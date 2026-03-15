import { handle } from "hono/aws-lambda"
import { Hono } from "hono"
import { issuer } from "@openauthjs/openauth"
import { createClient } from "@openauthjs/openauth/client"
import { GithubProvider } from "@openauthjs/openauth/provider/github"
import { MemoryStorage } from "@openauthjs/openauth/storage/memory"
import { subjects } from "./subjects"
import { z } from "zod"
import { Resource } from "sst"
import { createPrismaClient } from "@mcp-gcse/db"

const db = createPrismaClient(Resource.NeonPostgres.databaseUrl)

// Validate the registration request according to RFC 7591
const registrationSchema = z.object({
	redirect_uris: z.array(z.string().url()).optional(),
	client_name: z.string().optional(),
	client_uri: z.string().url().optional(),
	logo_uri: z.string().url().optional(),
	scope: z.string().optional(),
	grant_types: z.array(z.string()).optional(),
	response_types: z.array(z.string()).optional(),
	token_endpoint_auth_method: z.string().optional(),
	// Add other fields as needed
})

const client_id = `${Resource.App.name}_${Resource.App.stage}`

const db_map = new Map()

const app = issuer({
	subjects,
	storage: MemoryStorage(),
	// Remove after setting custom domain
	allow: async () => true,
	providers: {
		github: GithubProvider({
			clientID: Resource.GithubClientId.value,
			clientSecret: Resource.GithubClientSecret.value,
			scopes: ["email", "profile"],
		}),
	},
	success: async (ctx, value) => {
		console.log(value)
		if (value.provider === "github") {
			const gh_user = await fetchGithubUser(value.tokenset.access)

			console.log("gh_user", gh_user)

			// First check if user exists
			let user = await db.user.findFirst({
				where: {
					github_id: gh_user.id,
				},
			})

			// If user doesn't exist, create new one
			if (!user) {
				user = await db.user.create({
					data: {
						role: "admin",
						avatar_url: gh_user.avatar_url,
						github_id: gh_user.id,
						name: "Admin User",
						email: gh_user.email,
					},
				})
			}

			return ctx.subject("user", {
				userId: user.id,
			})
		}

		throw new Error("Invalid provider")
	},
})

// Add global CORS middleware
// app.use("*", async (c, next) => {
//   return c.json({}, 200, {
//     "Access-Control-Allow-Origin": "*",
//     "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
//     "Access-Control-Allow-Headers": "Content-Type, Authorization",
//   });
//   // await next();
// });

app.post("/register", async (c) => {
	try {
		const body = await c.req.json()

		const validatedData = registrationSchema.parse(body)
		console.log("Validated registration data:", validatedData)

		// const client_id =  `client_${Date.now()}_${Math.random()
		//   .toString(36)
		//   .substr(2, 9)}`;
		const client_secret = Math.random().toString(36).substr(2, 15)
		console.log("Generated client_id:", client_id)

		const clientRegistration = {
			client_id,
			client_secret,
			client_id_issued_at: Math.floor(Date.now() / 1000),
			client_secret_expires_at: 0, // 0 means no expiration
			...validatedData,
		}

		db_map.set(client_id, clientRegistration)
		console.log("Stored client registration for client_id:", client_id)

		return c.json(clientRegistration, 201)
	} catch (error) {
		console.error("Error processing registration request:", error)
		return c.json(
			{
				error: "invalid_request",
				error_description: "Invalid registration request",
			},
			400,
		)
	}
})

const client = createClient({
	clientID: client_id,
	issuer: `https://auth.${Resource.App.stage}.supalink.co`,
})

// OAuth 2.0 Token Introspection endpoint (RFC 7662)
app.post("/introspect", async (c) => {
	try {
		// Create OpenAuth client for token verification

		const body = await c.req.json()
		const { token } = body

		if (!token) {
			return c.json(
				{
					error: "invalid_request",
					error_description: "Token parameter is required",
				},
				400,
			)
		}

		// Verify the token using OpenAuth
		try {
			const tokenInfo = await client.verify(subjects, token)

			if (tokenInfo && "subject" in tokenInfo) {
				// Token is valid and active
				return c.json({
					active: true,
					client_id: client_id,
					scope: "openid profile email", // Based on your GitHub provider scopes
					sub: tokenInfo.subject.properties?.userId,
					exp: tokenInfo.tokens?.expiresIn,
					iat: Math.floor(Date.now() / 1000),
					token_type: "access_token",
				})
			}
			// Token is invalid or expired
			return c.json({ active: false })
		} catch (verificationError) {
			console.log("Token verification failed:", verificationError)
			// Token is invalid
			return c.json({
				active: false,
			})
		}
	} catch (error) {
		console.error("Error processing introspection request:", error)
		return c.json(
			{
				error: "invalid_request",
				error_description: "Invalid introspection request",
			},
			400,
		)
	}
})

// OpenAuth's built-in /.well-known/oauth-authorization-server omits
// registration_endpoint, so MCP clients can't discover /register via the
// standard discovery flow. Wrapping the issuer app in a parent Hono instance
// lets us intercept that route and add the missing field, since Hono executes
// handlers in registration order and our route is added first.
const issuerUrl = `https://auth.${Resource.App.stage}.supalink.co`
const wrappedApp = new Hono()
wrappedApp.get("/.well-known/oauth-authorization-server", (c) => {
	return c.json({
		issuer: issuerUrl,
		authorization_endpoint: `${issuerUrl}/authorize`,
		token_endpoint: `${issuerUrl}/token`,
		jwks_uri: `${issuerUrl}/.well-known/jwks.json`,
		response_types_supported: ["code", "token"],
		registration_endpoint: `${issuerUrl}/register`,
	})
})
wrappedApp.route("/", app)

export const handler = handle(wrappedApp)

interface UserProfile {
	id: string
	email: string | null
	login: string
	avatar_url: string
}

async function fetchGithubUser(accessToken: string): Promise<UserProfile> {
	const response = await fetch("https://api.github.com/user", {
		headers: {
			Authorization: `token ${accessToken}`,
		},
	})

	if (!response.ok) {
		throw new Error("Failed to fetch GitHub profile")
	}

	const json = await response.json()

	const profileData = z
		.object({
			id: z.coerce.string(),
			email: z.string().nullable(),
			login: z.string(),
			avatar_url: z.string(),
		})
		.parse(json)

	return profileData
}
