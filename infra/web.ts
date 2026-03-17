import { neonPostgres } from "./database"
import { auth, authUrl } from "./auth"
import { scansBucket } from "./storage"
import { ocrQueue, extractionQueue } from "./queues"

export const web = new sst.aws.Nextjs("Web", {
	path: "apps/web",
	link: [auth, neonPostgres, scansBucket, ocrQueue, extractionQueue],
	environment: {
		OPENAUTH_ISSUER: authUrl,
	},
})
