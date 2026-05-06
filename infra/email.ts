import { _DEVELOPMENT_, _PRODUCTION_, baseDomain, hostedZoneId } from "./config"

/**
 * Per-stage SES sender identity.
 *
 *  - Production: mail.getdeepmark.com
 *  - Development: mail.dev.getdeepmark.com
 *  - PR / personal stages: mail-{stage}.dev.getdeepmark.com
 *
 * Each stage gets its own SES identity + DKIM records — SST creates them
 * automatically against the Route 53 hosted zone, so a stage that's been
 * deployed once can send straight away. PR previews still get a working
 * sender so an end-to-end signup flow (with welcome email) is testable.
 */
const senderDomain = _PRODUCTION_
	? `mail.${baseDomain}`
	: _DEVELOPMENT_
		? `mail.dev.${baseDomain}`
		: `mail-${$app.stage}.dev.${baseDomain}`

export const email = new sst.aws.Email("Email", {
	sender: senderDomain,
	dns: sst.aws.dns({ zone: hostedZoneId }),
})
