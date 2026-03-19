import {
	githubClientId,
	githubClientSecret,
	googleClientId,
	googleClientSecret,
	hostedZoneId,
	subdomain,
	webUrl,
} from "./config"
import { neonPostgres } from "./database"

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
})

const authDomain = subdomain("auth")

export const authUrl = `https://${authDomain}`

export const authUrlLink = new sst.Linkable("AuthUrl", {
	properties: { url: authUrl },
})

/**
 * OpenAuth issuer with custom domain per stage
 *
 * - Production: auth.getdeepmark.com
 * - Development: auth.dev.getdeepmark.com
 * - PR stages: auth-pr-123.dev.getdeepmark.com
 */
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
		environment: {
			WEB_URL: webUrl,
		},
	},
	domain: {
		name: authDomain,
		dns: sst.aws.dns({
			zone: hostedZoneId,
		}),
	},
})
