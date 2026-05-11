/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
	app(input) {
		// Pulumi authenticates the Stripe provider with the shell `StripeSecretKey`,
		// while the runtime SDK reads the SST secret of the same name. If those drift
		// (test-mode shell + live-mode SST secret) Pulumi bakes test-mode price IDs
		// into Resource.StripeConfig and the Lambda 404s every checkout. Hard-fail at
		// synth time rather than discover the mismatch in a customer flow.
		const stripeKey = process.env.StripeSecretKey
		const isProduction = input?.stage === "production"
		if (!stripeKey) {
			throw new Error(
				"StripeSecretKey is not set in the shell. Load the right file first:\n" +
					"  prod:  set -a; source .env.stripe.production; set +a\n" +
					"  other: set -a; source .env.stripe.dev; set +a",
			)
		}
		if (isProduction && !stripeKey.startsWith("sk_live_")) {
			throw new Error(
				'Refusing to act on stage "production" with a non-live Stripe key. ' +
					"Run: set -a; source .env.stripe.production; set +a",
			)
		}
		if (!isProduction && !stripeKey.startsWith("sk_test_")) {
			throw new Error(
				`Refusing to act on stage "${input?.stage}" with a live Stripe key. ` +
					"Non-production stages (including `sst dev`) must use sk_test_. " +
					"Run: set -a; source .env.stripe.dev; set +a",
			)
		}

		return {
			name: "deepmark",
			removal: isProduction ? "retain" : "remove",
			home: "aws",
			providers: {
				aws: { region: "eu-west-2" },
				neon: { version: "0.9.0", apiKey: process.env.NEON_API_KEY! },
				stripe: {
					version: "0.0.24",
					apiKey: stripeKey,
				},
			},
		}
	},
	async run() {
		const { interactions, web } = await import("./infra")

		return { interactions: interactions.url, web: web.url }
	},
})
