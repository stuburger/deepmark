const mongoUri = new sst.Secret("MongoDbUri");
const openAiApiKey = new sst.Secret("OpenAiApiKey");

export const auth = new sst.aws.Auth("Auth", {
  issuer: {
    handler: "packages/backend/src/auth.handler",
    environment: {
      DATABASE_URL: mongoUri.value,
    },
  },

  // domain: `auth.${$app.stage}.supalink.co`,
});

const api = new sst.aws.Function("Api", {
  url: true,
  streaming: !$dev,
  timeout: "30 seconds",
  environment: {
    DATABASE_URL: mongoUri.value,
  },
  handler: "packages/backend/src/main.handler",
  link: [mongoUri, auth, openAiApiKey],
});

export const interactions = new sst.aws.Function("Interactions", {
  url: true,
  streaming: !$dev,
  timeout: "30 seconds",
  environment: {
    DATABASE_URL: mongoUri.value,
  },
  handler: "packages/backend/src/interactions/main.handler",
  link: [mongoUri, auth, openAiApiKey],
});

export const apiRouter = new sst.aws.Router("ApiRouter", {
  // domain: `mcp.${$app.stage}.supalink.co`,
  routes: { "/*": api.url },
});
