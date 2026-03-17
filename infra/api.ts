import { neonPostgres } from "./database"
import { scansBucket } from "./storage"
import { ocrQueue, markSchemePdfQueue, exemplarQueue } from "./queues"
import { auth, authUrlLink } from "./auth"
import { geminiApiKey, openAiApiKey } from "./config"

const api = new sst.aws.ApiGatewayV2("ApiGateway")

api.route("$default", {
	url: true,
	streaming: !$dev,
	timeout: "30 seconds",
	handler: "packages/backend/src/main.handler",
	link: [neonPostgres, authUrlLink, openAiApiKey, geminiApiKey, scansBucket, ocrQueue, markSchemePdfQueue, exemplarQueue, api],
	environment: {
		NODE_ENV: $dev ? "development" : "production",
	},
});

export const interactions = new sst.aws.Function("Interactions", {
	url: true,
	streaming: !$dev,
	timeout: "30 seconds",
	handler: "packages/backend/src/interactions/main.handler",
	link: [neonPostgres, auth, openAiApiKey],
	environment: {
		NODE_ENV: $dev ? "development" : "production",
	},
});
// https://yhberskgadpnxmo5gecdwmxgjm0edobk.lambda-url.us-east-1.on.aws/mcp
