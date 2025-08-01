import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js"

// export interface AuthInfo {
// 	token: string
// 	clientId: string
// 	scopes: string[]
// 	expiresAt: number
// 	userId?: string
// }

export type HonoVariables = {
	auth: AuthInfo
}
