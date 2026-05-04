import { auth, authUrlLink } from "./auth"
import { stripeConfig, stripeSecretKey } from "./billing"
import { geminiApiKey, openAiApiKey } from "./config"
import { neonPostgres } from "./database"
import { exemplarQueue, markSchemePdfQueue } from "./queues"
import { scansBucket } from "./storage"

export const api = new sst.aws.ApiGatewayV2("ApiGateway")

// Stripe webhook lives at `${api.url}/stripe/webhook` so SST Live Lambda Dev
// can tunnel deliveries down to localhost during `sst dev` — the previous
// Next.js route had no tunnel and Stripe events only ever hit the deployed
// (frozen) Lambda when developing locally.
const stripeWebhook = new stripe.WebhookEndpoint("StripeWebhook", {
	url: $interpolate`${api.url}/stripe/webhook`,
	enabledEvents: [
		"checkout.session.completed",
		"customer.subscription.created",
		"customer.subscription.updated",
		"customer.subscription.deleted",
		"invoice.payment_succeeded",
		"invoice.payment_failed",
		// Stripe-side refunds of one-off payments (PPU sets, top-ups). Triggers
		// a negative ledger entry to reverse the original grant.
		"charge.refunded",
	],
})

export const stripeWebhookSecret = new sst.Linkable("StripeWebhookSecret", {
	properties: { secret: stripeWebhook.secret },
})

api.route("$default", {
	url: true,
	streaming: !$dev,
	timeout: "30 seconds",
	handler: "packages/backend/src/main.handler",
	link: [
		neonPostgres,
		authUrlLink,
		geminiApiKey,
		openAiApiKey,
		scansBucket,
		markSchemePdfQueue,
		exemplarQueue,
		api,
		// Stripe webhook lives at /stripe/webhook on this Lambda — it needs the
		// signing secret to verify deliveries and the StripeConfig linkable for
		// per-plan grant sizes / fulfilment quantities.
		stripeSecretKey,
		stripeWebhookSecret,
		stripeConfig,
	],
	environment: {
		NODE_ENV: $dev ? "development" : "production",
	},
})

export const interactions = new sst.aws.Function("Interactions", {
	url: true,
	streaming: !$dev,
	timeout: "30 seconds",
	handler: "packages/backend/src/interactions/main.handler",
	link: [neonPostgres, auth, openAiApiKey],
	environment: {
		NODE_ENV: $dev ? "development" : "production",
	},
})
// https://yhberskgadpnxmo5gecdwmxgjm0edobk.lambda-url.us-east-1.on.aws/mcp
