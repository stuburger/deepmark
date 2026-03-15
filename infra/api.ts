import { neonPostgres } from "./database";

const openAiApiKey = new sst.Secret("OpenAiApiKey");
const geminiApiKey = new sst.Secret("GeminiApiKey");

const authUrl = `https://auth.${$app.stage}.supalink.co`;
const authUrlLink = new sst.Linkable("AuthUrl", {
	properties: { url: authUrl },
});

const githubClientId = new sst.Secret("GithubClientId");
const githubClientSecret = new sst.Secret("GithubClientSecret");

export const auth = new sst.aws.Auth("Auth", {
	issuer: {
		handler: "packages/backend/src/auth.handler",
		link: [neonPostgres, authUrlLink, githubClientId, githubClientSecret],
	},
	domain: `auth.${$app.stage}.supalink.co`,
});

const api = new sst.aws.ApiGatewayV2("ApiGateway")


api.route("$default", {
	url: true,
	streaming: !$dev,
	timeout: "30 seconds",
	handler: "packages/backend/src/main.handler",
	link: [neonPostgres, authUrlLink, openAiApiKey, geminiApiKey, api],
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
