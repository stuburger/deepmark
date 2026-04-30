import { collabServiceSecret } from "./config"
import { neonPostgres } from "./database"

export const collabAuthz = new sst.aws.Function("CollabAuthz", {
	url: true,
	timeout: "10 seconds",
	handler: "packages/backend/src/collab-authz.handler",
	link: [neonPostgres, collabServiceSecret],
	environment: {
		NODE_ENV: $dev ? "development" : "production",
	},
})
