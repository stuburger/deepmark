const mongoUri = new sst.Secret("MongoDbUri")
const openAiApiKey = new sst.Secret("OpenAiApiKey")

const authUrl = `https://auth.${$app.stage}.supalink.co`
const authUrlLink = new sst.Linkable("AuthUrl", {
	properties: { url: authUrl },
})

const githubClientId = new sst.Secret("GithubClientId")
const githubClientSecret = new sst.Secret("GithubClientSecret")

export const auth = new sst.aws.Auth("Auth", {
	issuer: {
		handler: "packages/backend/src/auth.handler",
		environment: {
			DATABASE_URL: mongoUri.value,
		},
		link: [authUrlLink, githubClientId, githubClientSecret],
		nodejs: {
			esbuild: {
				external: ["@prisma/client"],
			},
		},
		copyFiles: [
			{
				from: "packages/backend/generated/prisma",
				to: "generated/prisma",
			},
		],
	},
	domain: `auth.${$app.stage}.supalink.co`,
})

const api = new sst.aws.Function("Api", {
	url: true,
	streaming: !$dev,
	timeout: "30 seconds",
	environment: {
		DATABASE_URL: mongoUri.value,
	},
	handler: "packages/backend/src/main.handler",
	link: [mongoUri, authUrlLink, openAiApiKey],
	nodejs: {
		esbuild: {
			external: ["@prisma/client"],
		},
	},
	copyFiles: [
		{
			from: "packages/backend/generated/prisma",
			to: "generated/prisma",
		},
	],
})

export const interactions = new sst.aws.Function("Interactions", {
	url: true,
	streaming: !$dev,
	timeout: "30 seconds",
	environment: {
		DATABASE_URL: mongoUri.value,
	},
	handler: "packages/backend/src/interactions/main.handler",
	link: [mongoUri, auth, openAiApiKey],
	nodejs: {
		esbuild: {
			external: ["@prisma/client"],
		},
	},
	copyFiles: [
		{
			from: "packages/backend/generated/prisma",
			to: "generated/prisma",
		},
	],
})

// export const apiRouter = new sst.aws.Router("ApiRouter", {
//   // domain: `mcp.${$app.stage}.supalink.co`,
//   routes: { "/*": api.url },
// });
