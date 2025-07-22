const mongoUri = new sst.Secret("MongoDbUri")

export const auth = new sst.aws.Auth("Auth", {
	issuer: "packages/backend/src/auth.handler",
})

const api = new sst.aws.Function("Api", {
	url: true,
	streaming: !$dev,
	handler: "packages/backend/src/main.handler",
	link: [mongoUri, auth],
})

export const apiRouter = new sst.aws.Router("ApiRouter", {
	routes: { "/*": api.url },
})
