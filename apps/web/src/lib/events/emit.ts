import {
	EventBridgeClient,
	PutEventsCommand,
	type PutEventsRequestEntry,
} from "@aws-sdk/client-eventbridge"
import type {
	EventDetailType,
	EventSource,
	ResourceSharedDetail,
} from "@mcp-gcse/emails"
import { Resource } from "sst"

import { log } from "@/lib/logger"

const TAG = "events/emit"

/**
 * Events that the Next.js server (server actions) produces.
 * Events from backend Lambda processors live in
 * `packages/backend/src/lib/events/emit.ts`.
 */
type WebDomainEvent = {
	source: typeof EventSource.sharing
	detailType: typeof EventDetailType.resourceShared
	detail: ResourceSharedDetail
}

let cachedClient: EventBridgeClient | null = null

function getClient(): EventBridgeClient {
	if (!cachedClient) {
		cachedClient = new EventBridgeClient({})
	}
	return cachedClient
}

/**
 * Publish a domain event to the EventBus. Best-effort — never throws, never
 * blocks the caller. A publish failure is logged loudly and dropped so that
 * a transient EventBridge blip cannot break the server action that called it.
 */
export async function emitEvent(event: WebDomainEvent): Promise<boolean> {
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
			log.error(TAG, "EventBridge rejected entry", {
				source: event.source,
				detailType: event.detailType,
			})
			return false
		}
		log.info(TAG, "Published event", {
			source: event.source,
			detailType: event.detailType,
		})
		return true
	} catch (err) {
		log.error(TAG, "Failed to publish event", {
			source: event.source,
			detailType: event.detailType,
			error: err instanceof Error ? err.message : String(err),
		})
		return false
	}
}
