import {
	DescribeServicesCommand,
	ECSClient,
	ListTagsForResourceCommand,
	UntagResourceCommand,
	UpdateServiceCommand,
} from "@aws-sdk/client-ecs"
import { Resource } from "sst"

import { logger } from "@/lib/infra/logger"

const TAG = "collab-scale-down"

/**
 * Cron handler. Runs on permanent non-prod stages every 15 min.
 *
 * Logic:
 *   1. Describe the collab service to read its current desiredCount.
 *   2. If desiredCount == 0, no-op.
 *   3. Otherwise read its `collab:scaled-up-at` tag.
 *      - Tag missing or older than `IDLE_LIMIT_MS` → UpdateService(0) + remove tag.
 *      - Tag fresh → leave it alone, the user is still using it.
 *
 * The tag is the single source of truth for "when was this last scaled up"
 * — set by the scale-up server action in the web app. No DB row, no drift.
 */

const IDLE_LIMIT_MS = 30 * 60 * 1000
const SCALED_UP_AT_TAG = "collab:scaled-up-at"

const ecs = new ECSClient({})

export async function handler(): Promise<void> {
	const ref = Resource.CollabServiceRef
	if (!ref) {
		// Should never happen — the cron is only wired on stages where the
		// Linkable exists. Bail loudly so we notice if infra drifts.
		logger.error(TAG, "CollabServiceRef linkable is not present on this stage")
		return
	}
	const { clusterArn, serviceName } = ref

	const describe = await ecs.send(
		new DescribeServicesCommand({
			cluster: clusterArn,
			services: [serviceName],
		}),
	)

	const service = describe.services?.[0]
	if (!service?.serviceArn) {
		logger.warn(TAG, "service not found", { clusterArn, serviceName })
		return
	}
	if ((service.desiredCount ?? 0) === 0) {
		logger.info(TAG, "already at 0, skipping")
		return
	}

	const tagsResp = await ecs.send(
		new ListTagsForResourceCommand({ resourceArn: service.serviceArn }),
	)
	const scaledUpAtRaw = tagsResp.tags?.find(
		(t) => t.key === SCALED_UP_AT_TAG,
	)?.value
	const scaledUpAt = scaledUpAtRaw ? Date.parse(scaledUpAtRaw) : Number.NaN
	const ageMs = Number.isFinite(scaledUpAt)
		? Date.now() - scaledUpAt
		: Number.POSITIVE_INFINITY

	if (ageMs < IDLE_LIMIT_MS) {
		logger.info(TAG, "still within idle window, leaving up", {
			ageMs,
			limitMs: IDLE_LIMIT_MS,
		})
		return
	}

	logger.info(TAG, "scaling down", {
		ageMs,
		desiredCount: service.desiredCount,
	})

	await ecs.send(
		new UpdateServiceCommand({
			cluster: clusterArn,
			service: serviceName,
			desiredCount: 0,
		}),
	)
	if (scaledUpAtRaw) {
		await ecs.send(
			new UntagResourceCommand({
				resourceArn: service.serviceArn,
				tagKeys: [SCALED_UP_AT_TAG],
			}),
		)
	}
}
