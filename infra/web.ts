import { stripeWebhookSecret } from "./api"
import { auth, authUrl } from "./auth"
import { stripeConfig, stripePublishableKey, stripeSecretKey } from "./billing"
import { collabServer, collabServiceRef } from "./collab"
import {
	domain,
	_PRODUCTION_,
	anthropicApiKey,
	collabServiceSecret,
	collabUrl,
	geminiApiKey,
	openAiApiKey,
	posthogPublicKey,
	vapidPrivateKey,
	vapidPublicKey,
	webUrl,
} from "./config"
import { neonPostgres } from "./database"
import { bus } from "./events"
import { pdfRendererFn } from "./pdf-renderer"
import {
	batchClassifyQueue,
	exemplarQueue,
	markSchemePdfQueue,
	paperBundleQueue,
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
		paperBundleQueue,
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
		// Class PDF export sync-invokes this Lambda; SST grants
		// `lambda:InvokeFunction` and exposes `Resource.PdfRenderer.name`.
		pdfRendererFn,
		// Non-prod only: address + creds for the on-demand collab service
		// scale-up control. Production has no link → server actions early-return.
		// On-demand collab service scale-up control. Always linked so
		// `Resource.CollabServiceRef` is dereferenceable on every stage;
		// the Linkable carries empty `clusterArn`/`serviceName` strings
		// on stages without their own Service. Consumers detect that and
		// short-circuit. See infra/collab.ts.
		collabServiceRef,
	],
	// Non-prod stages get ECS perms scoped to the dev collab service so the
	// scale-up server action (and status query) can call DescribeServices /
	// UpdateService / TagResource. Production has no Service to manage.
	permissions: _PRODUCTION_
		? undefined
		: [
				{
					actions: [
						"ecs:DescribeServices",
						"ecs:UpdateService",
						"ecs:TagResource",
						"ecs:UntagResource",
						"ecs:ListTagsForResource",
					],
					// Wildcard on the service ARN — we don't know the exact cluster
					// name at synth time on PR stages (it's read from SSM), and ECS
					// service ARNs always live under our account in this region.
					resources: [
						$interpolate`arn:aws:ecs:eu-west-2:${aws.getCallerIdentityOutput().accountId}:service/*/*`,
					],
				},
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
		// PostHog: key is exposed to the browser at build time. The host is
		// our first-party `/ingest` path — the Router (router.ts) reverse-
		// proxies it to eu.i.posthog.com so requests bypass ad-blockers.
		// On non-permanent stages the proxy doesn't exist, so the provider
		// reads NEXT_PUBLIC_STAGE and no-ops.
		NEXT_PUBLIC_POSTHOG_KEY: posthogPublicKey.value,
		NEXT_PUBLIC_POSTHOG_HOST: "/ingest",
	},
})
