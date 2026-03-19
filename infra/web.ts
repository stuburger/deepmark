import { auth, authUrl } from "./auth"
import { domain, webUrl } from "./config"
import { neonPostgres } from "./database"
import {
	exemplarQueue,
	extractionQueue,
	markSchemePdfQueue,
	ocrQueue,
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
		ocrQueue,
		extractionQueue,
		markSchemePdfQueue,
		exemplarQueue,
		studentPaperOcrQueue,
		studentPaperQueue,
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
