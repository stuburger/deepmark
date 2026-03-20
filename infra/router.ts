import { domain, hostedZoneId, isPermanentStage } from "./config"

/**
 * SST Router for handling domain routing
 *
 * For permanent stages (production, development):
 *   - Creates a new Router with custom domain configuration
 *   - Production: getdeepmark.com with *.getdeepmark.com aliases
 *   - Development: dev.getdeepmark.com with *.dev.getdeepmark.com aliases
 *
 * For PR preview stages:
 *   - SHARES the development router using sst.aws.Router.get()
 *   - PR domains like pr-123.dev.getdeepmark.com use the dev CloudFront distribution
 *
 * After first deploying the development stage, set DEV_ROUTER_DISTRIBUTION_ID
 * to the Router's CloudFront distribution ID (SST Console or outputs).
 */
// TODO: Set this after the first deploy of the development stage
const DEV_ROUTER_DISTRIBUTION_ID = "E128W2HPX5L4SZ"

export const router = isPermanentStage
	? new sst.aws.Router("Router", {
			domain: {
				name: domain,
				aliases: [`*.${domain}`],
				dns: sst.aws.dns({
					zone: hostedZoneId,
				}),
			},
		})
	: sst.aws.Router.get("Router", DEV_ROUTER_DISTRIBUTION_ID)

// PostHog reverse proxy — only on permanent stages (PR stages share the dev router
// and cannot add new routes to a Router.get() reference).
//
// /ingest/static/* → eu-assets.i.posthog.com  (JS bundles, toolbar assets)
// /ingest/*        → eu.i.posthog.com          (event capture, decide, flags)
//
// posthog-provider.tsx points api_host at /ingest so that browser requests
// never leave the first-party domain, bypassing ad-blocker interference.
if (isPermanentStage) {
	router.route(`${domain}/ingest/static`, "https://eu-assets.i.posthog.com", {
		rewrite: {
			regex: "^/ingest/static/(.*)$",
			to: "/static/$1",
		},
	})

	router.route(`${domain}/ingest`, "https://eu.i.posthog.com", {
		rewrite: {
			regex: "^/ingest/(.*)$",
			to: "/$1",
		},
	})
}
