/// <reference path="./.sst/platform/config.d.ts" />

/**
 * DeepMark Shared — Google Workspace DNS
 *
 * Standalone SST app that owns the Route53 records required to verify and
 * operate Google Workspace on `getdeepmark.com`. This is intentionally
 * separate from the main `deepmark` app:
 *
 *   - These records are account/domain-level singletons, not per-stage.
 *   - `removal: "retain"` — never tear this down by accident.
 *   - Deployed once, manually, against AWS_PROFILE=deepmark.
 *
 * Deploy:
 *   cd shared/gmail-dns
 *   AWS_PROFILE=deepmark bunx sst deploy --stage=production
 */
export default $config({
	app() {
		return {
			name: "deepmark-shared-gmail-dns",
			removal: "retain",
			home: "aws",
			providers: { aws: { region: "eu-west-2" } },
		}
	},
	async run() {
		// The getdeepmark.com Route53 hosted zone.
		// Duplicated from infra/config.ts on purpose — this app is standalone
		// and must not import from the main deepmark app.
		const HOSTED_ZONE_ID = "Z1039796VEIQXWRMZ4EY"

		// Domain ownership verification for Google Workspace admin console.
		new aws.route53.Record("GoogleSiteVerificationTxt", {
			zoneId: HOSTED_ZONE_ID,
			name: "", // root domain (getdeepmark.com)
			type: "TXT",
			ttl: 60,
			records: [
				"google-site-verification=0VOa2AIoKhWoOa-5MIcXKNeaXAr30V3IU3LnEeGklLE",
			],
		})

		// Google Workspace inbound mail routing.
		new aws.route53.Record("GoogleWorkspaceMx", {
			zoneId: HOSTED_ZONE_ID,
			name: "", // root domain
			type: "MX",
			ttl: 60,
			records: ["1 smtp.google.com"],
		})

		// Google Workspace DKIM signing key (2048-bit).
		//
		// The full TXT value is ~360 chars but Route53 caps each character-string
		// at 255 octets. AWS expects long TXT values to be split into multiple
		// quoted strings within a single RR ("chunk1" "chunk2"); resolvers
		// concatenate them transparently. The Pulumi provider wraps each item in
		// `records` with an outer pair of quotes on its own, so we pass the
		// chunks joined by `" "` (quote-space-quote) — Pulumi then adds the
		// outer quotes to produce the correct `"chunk1" "chunk2"` form.
		const dkimValue =
			"v=DKIM1;k=rsa;p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA7db5L65oyKV9dqo97D7+erG8dcTAoXx/m3M4hYsnpDposU04wh903q/RjtNzEM8ICJQPBAtjIERXV39jczE5KIdO8GSBcJpKgW7eWBli/GimkDJWSl7iXMEJQkCU/KjmO5DgeuEOxpugxr9v2z89q02Do7hV8e3Fdr1mKdGP8akaFKayG1JlwJ7t8U8HGHp/f2R9ZzYx4IUukmLRsViW2qAJCBCiI4P/mfKJ+HpTsTDGhoK8ZZhZCK4MpJWQOPvlsfc8EL5e0fZrSBFmxJqg0wqHzvgoVy4IA7Gs8EI09S7WxKeh7MtkUGsMJ2Y7cPtPfUn+PpVi3bVNnsjlHdoYaQIDAQAB"
		const dkimChunks = dkimValue.match(/.{1,255}/g) ?? []
		const dkimRecord = dkimChunks.join('" "')

		new aws.route53.Record("GoogleWorkspaceDkim", {
			zoneId: HOSTED_ZONE_ID,
			name: "google._domainkey",
			type: "TXT",
			ttl: 60,
			records: [dkimRecord],
		})

		return {
			zoneId: HOSTED_ZONE_ID,
			note: "Google Workspace DNS for getdeepmark.com — singleton, do not tear down",
		}
	},
})
