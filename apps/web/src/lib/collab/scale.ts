"use server"

import {
	DescribeServicesCommand,
	ECSClient,
	ListTagsForResourceCommand,
	TagResourceCommand,
	UpdateServiceCommand,
} from "@aws-sdk/client-ecs"
import { Resource } from "sst"

import { authenticatedAction } from "@/lib/authz"

/**
 * On-demand scale-up of the collab Fargate service for non-prod stages.
 *
 * Production is always-on, so these actions early-return on production —
 * `Resource.CollabServiceRef` isn't linked there and reading it would throw.
 *
 * Tag-driven state model:
 *   - `collab:scaled-up-at` ECS tag = the last time someone hit "start".
 *   - The scale-down cron (15-min rate) reads this tag and tears the service
 *     back down to desiredCount=0 once it's > 30 min old.
 *   - Re-clicking "start" while running just refreshes the tag, which
 *     extends the auto-stop window.
 *
 * No DB row. Single source of truth lives on the ECS service itself.
 */

const SCALED_UP_AT_TAG = "collab:scaled-up-at"
const IDLE_LIMIT_MS = 30 * 60 * 1000

const STAGE = process.env.STAGE
const IS_PRODUCTION = STAGE === "production"

const ecs = new ECSClient({})

export type CollabServiceStatus = {
	stage: string
	manageable: boolean
	desiredCount: number
	runningCount: number
	pendingCount: number
	scaledUpAt: string | null
	autoStopsAt: string | null
}

function ref(): { clusterArn: string; serviceName: string } | null {
	return Resource.CollabServiceRef ?? null
}

export const getCollabStatus = authenticatedAction.action(
	async (): Promise<CollabServiceStatus | null> => {
		if (IS_PRODUCTION) return null

		// `sst dev` on a personal stage doesn't synthesize the Linkable —
		// hide the UI rather than throw.
		const r = ref()
		if (!r) return null
		const { clusterArn, serviceName } = r

		const describe = await ecs.send(
			new DescribeServicesCommand({
				cluster: clusterArn,
				services: [serviceName],
			}),
		)
		const service = describe.services?.[0]
		if (!service?.serviceArn) {
			return {
				stage: STAGE ?? "unknown",
				manageable: false,
				desiredCount: 0,
				runningCount: 0,
				pendingCount: 0,
				scaledUpAt: null,
				autoStopsAt: null,
			}
		}

		const tagsResp = await ecs.send(
			new ListTagsForResourceCommand({ resourceArn: service.serviceArn }),
		)
		const scaledUpAtRaw =
			tagsResp.tags?.find((t) => t.key === SCALED_UP_AT_TAG)?.value ?? null
		const autoStopsAt =
			scaledUpAtRaw && (service.desiredCount ?? 0) > 0
				? new Date(Date.parse(scaledUpAtRaw) + IDLE_LIMIT_MS).toISOString()
				: null

		return {
			stage: STAGE ?? "unknown",
			manageable: true,
			desiredCount: service.desiredCount ?? 0,
			runningCount: service.runningCount ?? 0,
			pendingCount: service.pendingCount ?? 0,
			scaledUpAt: scaledUpAtRaw,
			autoStopsAt,
		}
	},
)

export const scaleUpCollab = authenticatedAction.action(
	async (): Promise<CollabServiceStatus> => {
		if (IS_PRODUCTION) {
			throw new Error("scaleUpCollab is not available on production")
		}

		const r = ref()
		if (!r) {
			throw new Error("Collab service is not configured on this stage")
		}
		const { clusterArn, serviceName } = r

		const describe = await ecs.send(
			new DescribeServicesCommand({
				cluster: clusterArn,
				services: [serviceName],
			}),
		)
		const service = describe.services?.[0]
		if (!service?.serviceArn) {
			throw new Error("collab service not found")
		}

		const now = new Date().toISOString()

		// Always refresh the tag — re-clicking on an already-running service
		// extends the auto-stop window. UpdateService is only called if we're
		// currently at 0 (avoids an unnecessary ECS event on hot-clicks).
		await ecs.send(
			new TagResourceCommand({
				resourceArn: service.serviceArn,
				tags: [{ key: SCALED_UP_AT_TAG, value: now }],
			}),
		)
		if ((service.desiredCount ?? 0) === 0) {
			await ecs.send(
				new UpdateServiceCommand({
					cluster: clusterArn,
					service: serviceName,
					desiredCount: 1,
				}),
			)
		}

		return {
			stage: STAGE ?? "unknown",
			manageable: true,
			desiredCount: 1,
			runningCount: service.runningCount ?? 0,
			pendingCount: Math.max(service.pendingCount ?? 0, 1),
			scaledUpAt: now,
			autoStopsAt: new Date(Date.parse(now) + IDLE_LIMIT_MS).toISOString(),
		}
	},
)
