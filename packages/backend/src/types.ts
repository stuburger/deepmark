import type { LambdaEvent, LambdaContext } from "hono/aws-lambda"
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js"

// export interface AuthInfo {
// 	token: string
// 	clientId: string
// 	scopes: string[]
// 	expiresAt: number
// 	userId?: string
// }

export type HonoVariables = {
	auth: AuthInfo & { extra: { userId: string } }
}

export type Bindings = {
	event: LambdaEvent
	lambdaContext: LambdaContext
}

export type HonoEnv = { Variables: HonoVariables; Bindings: Bindings }
