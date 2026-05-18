import { collabServer, collabServiceRef } from "./collab"
import { _PRODUCTION_, isPermanentStage } from "./config"

/**
 * Permanent non-prod stages (today: `development`) run a 15-min cron that
 * scales the collab service down to desiredCount=0 if its `collab:scaled-up-at`
 * tag is older than 30 min. PR/personal stages don't get their own cron —
 * the dev cron services them too, because they share the same Fargate
 * Service via `CollabServiceRef`.
 *
 * Production has no cron (the service is always-on).
 * sst dev has no cron (no cloud resources).
 */
// `collabServiceRef` is always synthesised (with empty-string placeholder
// properties on stages without their own Service — see infra/collab.ts).
// The cron itself is only wired on permanent non-prod stages where a real
// Service exists; the handler additionally guards against the empty
// placeholder so a misconfigured deploy bails loudly instead of
// thrashing ECS APIs against an empty cluster ARN.
if (!$dev && !_PRODUCTION_ && isPermanentStage) {
	new sst.aws.Cron("CollabScaleDown", {
		// Window is 30–45 min: tag age check is "> 30 min", cron fires every 15.
		schedule: "rate(15 minutes)",
		job: {
			handler: "packages/backend/src/processors/collab-scale-down.handler",
			timeout: "30 seconds",
			link: [collabServiceRef],
			permissions: [
				{
					actions: [
						"ecs:DescribeServices",
						"ecs:UpdateService",
						"ecs:UntagResource",
						"ecs:ListTagsForResource",
					],
					resources: [
						$interpolate`arn:aws:ecs:eu-west-2:${aws.getCallerIdentityOutput().accountId}:service/*/*`,
					],
				},
			],
		},
	})
}

// Reference `collabServer` so this module sequences after collab.ts in the
// import graph (the cron's permissions assume the service exists).
void collabServer
