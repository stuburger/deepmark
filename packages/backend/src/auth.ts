import { createPrismaClient } from "@mcp-gcse/db"
import { issuer } from "@openauthjs/openauth"
import { createClient } from "@openauthjs/openauth/client"
import { GithubProvider } from "@openauthjs/openauth/provider/github"
import { GoogleProvider } from "@openauthjs/openauth/provider/google"
import { DynamoStorage } from "@openauthjs/openauth/storage/dynamo"
import { Hono } from "hono"
import { handle } from "hono/aws-lambda"
import { Resource } from "sst"
import { z } from "zod/v4"
import { subjects } from "./subjects"

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

function normaliseEmail(raw: string): string {
	return raw.trim().toLowerCase()
}

async function attachPendingResourceGrantsForSignup(user: {
	id: string
	email: string | null
}): Promise<void> {
	if (!user.email) return
	await db.resourceGrant.updateMany({
		where: {
			principal_email: normaliseEmail(user.email),
			principal_user_id: null,
			principal_type: "user",
			revoked_at: null,
		},
		data: {
			principal_user_id: user.id,
			accepted_at: new Date(),
		},
	})
}

/**
 * Seed a fresh user's free-trial paper allowance as a single `trial_grant`
 * ledger entry. Idempotent: if the user already has one (e.g. webhook
 * replay, or this fires on a returning user via a code path that bypassed
 * the existing-user branch), it's a no-op.
 *
 * Uses Resource.StripeConfig.trialPaperCap as the source of truth so trial
 * size is configurable in one place (infra/billing.ts) without code changes.
 */
async function seedTrialGrant(userId: string): Promise<void> {
	const existing = await db.paperLedgerEntry.findFirst({
		where: { user_id: userId, kind: "trial_grant" },
		select: { id: true },
	})
	if (existing) return
	await db.paperLedgerEntry.create({
		data: {
			user_id: userId,
			papers: Resource.StripeConfig.trialPaperCap,
			kind: "trial_grant",
		},
	})
}

const app = issuer({
	subjects,
	storage: DynamoStorage({
		table: Resource.AuthTable.name,
	}),
	// Remove after setting custom domain
	allow: async () => true,
	providers: {
		github: GithubProvider({
			clientID: Resource.GithubClientId.value,
			clientSecret: Resource.GithubClientSecret.value,
			scopes: ["email", "profile"],
		}),
		google: GoogleProvider({
			clientID: Resource.GoogleClientId.value,
			clientSecret: Resource.GoogleClientSecret.value,
			scopes: ["email", "profile"],
			query: {
				prompt: "select_account",
			},
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
						role: "teacher",
						avatar_url: gh_user.avatar_url,
						github_id: gh_user.id,
						name: gh_user.login,
						email: gh_user.email,
					},
				})
			}

			// Run on every login (not just signup): both helpers are idempotent.
			// Self-heals any signup whose user.create succeeded but a side effect
			// failed (Neon blip, etc.) — without this hoist the user would be
			// permanently stuck at zero balance because the next login skips the
			// `if (!user)` block. Also retroactively attaches resources shared with
			// the user's email after their account already existed.
			await attachPendingResourceGrantsForSignup(user)
			await seedTrialGrant(user.id)

			return ctx.subject("user", {
				userId: user.id,
				email: user.email,
			})
		}

		if (value.provider === "google") {
			const googleUser = await fetchGoogleUser(value.tokenset.access)

			let user = await db.user.findFirst({
				where: {
					email: googleUser.email,
				},
			})

			if (!user) {
				user = await db.user.create({
					data: {
						role: "teacher",
						avatar_url: googleUser.avatar_url,
						name: googleUser.login,
						email: googleUser.email,
					},
				})
			}

			// Run on every login (not just signup): see GitHub branch above.
			await attachPendingResourceGrantsForSignup(user)
			await seedTrialGrant(user.id)

			return ctx.subject("user", {
				userId: user.id,
				email: user.email,
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
	issuer: Resource.AuthUrl.url,
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
					email: tokenInfo.subject.properties?.email,
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
const issuerUrl = Resource.AuthUrl.url
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

async function fetchGoogleUser(accessToken: string): Promise<UserProfile> {
	const response = await fetch(
		"https://www.googleapis.com/oauth2/v2/userinfo",
		{
			headers: {
				Authorization: `Bearer ${accessToken}`,
			},
		},
	)

	if (!response.ok) {
		throw new Error("Failed to fetch Google profile")
	}

	const json = await response.json()
	const profileData = z
		.object({
			id: z.coerce.string(),
			email: z.string(),
			name: z.string(),
			picture: z.string(),
		})
		.parse(json)

	return {
		id: profileData.id,
		email: profileData.email,
		login: profileData.name,
		avatar_url: profileData.picture,
	}
}
