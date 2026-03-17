import { neonPostgres } from "./database";
import {
	githubClientId,
	githubClientSecret,
	googleClientId,
	googleClientSecret,
} from "./config";

export const authTable = new sst.aws.Dynamo("AuthTable", {
	fields: {
		pk: "string",
		sk: "string",
	},
	ttl: "expiry",
	primaryIndex: {
		hashKey: "pk",
		rangeKey: "sk",
	},
});

export const authUrl = `https://auth.${$app.stage}.supalink.co`;

export const authUrlLink = new sst.Linkable("AuthUrl", {
	properties: { url: authUrl },
});

export const auth = new sst.aws.Auth("Auth", {
	issuer: {
		handler: "packages/backend/src/auth.handler",
		link: [
			neonPostgres,
			authUrlLink,
			authTable,
			githubClientId,
			githubClientSecret,
			googleClientId,
			googleClientSecret,
		],
	},
	domain: `auth.${$app.stage}.supalink.co`,
});
