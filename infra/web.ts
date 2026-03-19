import { auth, authUrl } from "./auth"
import { neonPostgres } from "./database"
import {
	exemplarQueue,
	extractionQueue,
	markSchemePdfQueue,
	ocrQueue,
	studentPaperOcrQueue,
	studentPaperQueue,
} from "./queues"
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
	environment: {
		OPENAUTH_ISSUER: authUrl,
	},
})
