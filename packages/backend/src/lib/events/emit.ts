import {
	EventBridgeClient,
	PutEventsCommand,
	type PutEventsRequestEntry,
} from "@aws-sdk/client-eventbridge"
import type {
	BatchCompletedDetail,
	EventDetailType,
	EventSource,
	PpuPurchasedDetail,
	SubscriptionUpgradedDetail,
	TopupPurchasedDetail,
	UserSignedUpDetail,
} from "@mcp-gcse/emails"
import { Resource } from "sst"

import { logger } from "@/lib/infra/logger"

const TAG = "events/emit"

/**
 * Discriminated union of every event we emit. Adding a new emit site means
 * adding a variant here — the EmailSubscriber's switch is exhaustive on the
 * detail-type, so the compiler will tell you what else needs updating.
 */
export type DomainEvent =
	| {
			source: typeof EventSource.users
			detailType: typeof EventDetailType.userSignedUp
			detail: UserSignedUpDetail
	  }
	| {
			source: typeof EventSource.billing
			detailType: typeof EventDetailType.subscriptionUpgraded
			detail: SubscriptionUpgradedDetail
	  }
	| {
			source: typeof EventSource.billing
			detailType: typeof EventDetailType.ppuPurchased
			detail: PpuPurchasedDetail
	  }
	| {
			source: typeof EventSource.billing
			detailType: typeof EventDetailType.topupPurchased
			detail: TopupPurchasedDetail
	  }
	| {
			source: typeof EventSource.marking
			detailType: typeof EventDetailType.batchCompleted
			detail: BatchCompletedDetail
	  }

let cachedClient: EventBridgeClient | null = null

function getClient(): EventBridgeClient {
	if (!cachedClient) {
		cachedClient = new EventBridgeClient({})
	}
	return cachedClient
}

/**
 * Publish a domain event to the EventBus. Best-effort: never throws,
 * never blocks the caller. A publish failure is logged loudly and
 * dropped — emit sites are in critical paths (signup, webhook handlers,
 * grader) and a transient EventBridge blip must not break those flows.
 *
 * If the bus genuinely matters for a given event (it doesn't yet), the
 * caller can `await emitEvent(...)` and check the return value to react.
 */
export async function emitEvent(event: DomainEvent): Promise<boolean> {
	const entry: PutEventsRequestEntry = {
		EventBusName: Resource.EventBus.name,
		Source: event.source,
		DetailType: event.detailType,
		Detail: JSON.stringify(event.detail),
	}

	try {
		const result = await getClient().send(
			new PutEventsCommand({ Entries: [entry] }),
		)
		const failed = result.FailedEntryCount ?? 0
		if (failed > 0) {
			logger.error(TAG, "EventBridge rejected entry", {
				source: event.source,
				detailType: event.detailType,
				entries: result.Entries,
			})
			return false
		}
		logger.info(TAG, "Published event", {
			source: event.source,
			detailType: event.detailType,
		})
		return true
	} catch (err) {
		logger.error(TAG, "Failed to publish event", {
			source: event.source,
			detailType: event.detailType,
			error: err instanceof Error ? err.message : String(err),
		})
		return false
	}
}
