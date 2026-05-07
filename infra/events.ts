import { stripeConfig } from "./billing"
import { vapidPrivateKey, vapidPublicKey, webUrl } from "./config"
import { neonPostgres } from "./database"
import { email } from "./email"

/**
 * EventBridge bus is the single fanout point for "something happened" events
 * across the app. Today it has two consumers (email + push); the next PR adds
 * an analytics consumer for PostHog, and the pattern is good for a third when
 * the next reactive surface lands.
 *
 * Conventions:
 *   - `source` is `deepmark.<domain>` — `deepmark.users`,
 *     `deepmark.billing`, `deepmark.marking`. Subscribers filter by source.
 *   - Each subscriber owns a single concern. We deliberately do NOT mix
 *     analytics + transactional email in one handler (that's the fwdcheck
 *     mistake). Crashing the analytics path must not block customer emails.
 *   - Every subscriber has a DLQ + bounded retries. Pre-launch rule:
 *     LLM/infra spend is personal money, so a malformed event must not
 *     pin a Lambda OOM-loop.
 */

// Each subscriber gets its own DLQ — failures land in a phase-specific queue
// so an oncall doesn't have to disambiguate between dropped emails and dropped
// pushes.
const emailSubscriberDlq = new sst.aws.Queue("EmailSubscriberDLQ", {
	visibilityTimeout: "1 minute",
})
const pushSubscriberDlq = new sst.aws.Queue("PushSubscriberDLQ", {
	visibilityTimeout: "1 minute",
})

export const bus = new sst.aws.Bus("EventBus")

// EmailSubscriber: dispatches transactional emails based on detail-type.
// Listens on the three domain sources we currently emit from. PostHog
// (next PR) will be a separate subscriber on a wider source pattern.
bus.subscribe(
	"EmailSubscriber",
	{
		handler: "packages/backend/src/processors/email-subscriber.handler",
		link: [email, neonPostgres, stripeConfig],
		timeout: "30 seconds",
		memory: "512 MB",
		environment: {
			WEB_URL: webUrl,
		},
	},
	{
		pattern: {
			source: ["deepmark.users", "deepmark.billing", "deepmark.marking"],
		},
		retries: 2,
		transform: {
			target: {
				deadLetterConfig: { arn: emailSubscriberDlq.arn },
			},
		},
	},
)

// PushSubscriber: replaces the inline web-push call previously made directly
// from the grading processor. Same contract (one push per batch, addressed
// to the teacher), just driven by the bus instead of an in-process import.
bus.subscribe(
	"PushSubscriber",
	{
		handler: "packages/backend/src/processors/push-subscriber.handler",
		link: [neonPostgres, vapidPublicKey, vapidPrivateKey],
		timeout: "30 seconds",
		memory: "512 MB",
	},
	{
		pattern: {
			source: ["deepmark.marking"],
			"detail-type": ["batch.completed"],
		},
		retries: 2,
		transform: {
			target: {
				deadLetterConfig: { arn: pushSubscriberDlq.arn },
			},
		},
	},
)
