import { stripeWebhookSecret } from "./api"
import { auth, authUrl } from "./auth"
import { stripeConfig, stripePublishableKey, stripeSecretKey } from "./billing"
import { collabServer } from "./collab"
import {
	domain,
	anthropicApiKey,
	collabServiceSecret,
	collabUrl,
	geminiApiKey,
	openAiApiKey,
	vapidPrivateKey,
	vapidPublicKey,
	webUrl,
} from "./config"
import { neonPostgres } from "./database"
import { bus } from "./events"
import {
	batchClassifyQueue,
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
	server: {
		// Class PDF export renders react-pdf for every student in-process and
		// uploads the result to S3. Defaults (20s / 1024 MB) are too tight for
		// classes of 25-30+; this gives headroom while staying inside the 60s
		// CloudFront cap.
		timeout: "60 seconds",
		memory: "3008 MB",
	},
	link: [
		auth,
		neonPostgres,
		scansBucket,
		exemplarQueue,
		markSchemePdfQueue,
		questionPaperQueue,
		studentPaperOcrQueue,
		studentPaperQueue,
		batchClassifyQueue,
		collabServer,
		// Server-action override mutations open a HeadlessEditor against
		// Hocuspocus and dispatch the change onto the doc — see
		// `apps/web/src/lib/collab/headless-edit.ts`.
		collabServiceSecret,
		geminiApiKey,
		openAiApiKey,
		anthropicApiKey,
		vapidPublicKey,
		vapidPrivateKey,
		stripeConfig,
		stripeSecretKey,
		stripePublishableKey,
		stripeWebhookSecret,
		// Linked for parity — current emit sites are on the API + Auth Lambdas,
		// but admin/preview pages render templates with @mcp-gcse/emails which
		// statically imports the SES client from sst-env (so the resource needs
		// to be reachable at build time for type generation).
		bus,
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
		NEXT_PUBLIC_COLLAB_URL: collabUrl,
		NEXT_PUBLIC_STAGE: $app.stage,
		STAGE: $app.stage,
	},
})
