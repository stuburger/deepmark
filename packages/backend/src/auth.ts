import { handle } from "hono/aws-lambda"
import { issuer } from "@openauthjs/openauth"
import { CodeUI } from "@openauthjs/openauth/ui/code"
import { CodeProvider } from "@openauthjs/openauth/provider/code"
import { GithubProvider } from "@openauthjs/openauth/provider/github"
import { MemoryStorage } from "@openauthjs/openauth/storage/memory"
import { subjects } from "./subjects"
import { z } from "zod"

async function getUser(email: string) {
	// Get user from database and return user ID
	return "123"
}

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

const db = new Map()

const app = issuer({
	subjects,
	storage: MemoryStorage(),
	// Remove after setting custom domain
	allow: async () => true,
	providers: {
		github: GithubProvider({
			clientID: "Ov23liAjeJ1QCQoDg1I6",
			clientSecret: "d3f51ed263b37e6761c320322befc300780de971",
			scopes: ["email", "profile"],
		}),
		// code: CodeProvider(
		//   CodeUI({
		//     sendCode: async (email, code) => {
		//       console.log(email, code);
		//     },
		//   })
		// ),
	},
	success: async (ctx, value) => {
		console.log(value)
		if (value.provider === "github") {
			return ctx.subject("user", {
				// @ts-expect-error
				userId: await getUser(value),
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

		const client_id = `client_${Date.now()}_${Math.random()
			.toString(36)
			.substr(2, 9)}`
		const client_secret = Math.random().toString(36).substr(2, 15)
		console.log("Generated client_id:", client_id)

		const clientRegistration = {
			client_id,
			client_secret,
			client_id_issued_at: Math.floor(Date.now() / 1000),
			client_secret_expires_at: 0, // 0 means no expiration
			...validatedData,
		}

		db.set(client_id, clientRegistration)
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

export const handler = handle(app)
