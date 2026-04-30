import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js"
import type { LambdaContext, LambdaEvent } from "hono/aws-lambda"

// export interface AuthInfo {
// 	token: string
// 	clientId: string
// 	scopes: string[]
// 	expiresAt: number
// 	userId?: string
// }

export type HonoVariables = {
	auth: AuthInfo & { extra: { userId: string; email: string | null } }
}

export type Bindings = {
	event: LambdaEvent
	lambdaContext: LambdaContext
}

export type HonoEnv = { Variables: HonoVariables; Bindings: Bindings }
