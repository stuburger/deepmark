import { auth, authUrl } from "./auth"
import { domain, geminiApiKey, webUrl } from "./config"
import { neonPostgres } from "./database"
import {
	exemplarQueue,
	markSchemePdfQueue,
	questionPaperQueue,
	studentPaperOcrQueue,
	studentPaperQueue,
} from "./queues"
import { router } from "./router"
import { scansBucket } from "./storage"

export const web = new sst.aws.Nextjs("Web", {
	path: "apps/web",
	link: [
		auth,
		neonPostgres,
		scansBucket,
		exemplarQueue,
		markSchemePdfQueue,
		questionPaperQueue,
		studentPaperOcrQueue,
		studentPaperQueue,
		geminiApiKey,
	],
	dev: {
		url: "http://localhost:3000",
	},
	router: {
		instance: router,
		domain: domain,
	},
	environment: {
		OPENAUTH_ISSUER: authUrl,
		NEXT_PUBLIC_APP_URL: webUrl,
	},
})
