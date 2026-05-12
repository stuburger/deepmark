import { authUrlLink } from "./auth"
import { collabAuthz } from "./authz"
import {
	_PRODUCTION_,
	baseDomain,
	collabServiceSecret,
	hasStageVpc,
	hostedZoneId,
	subdomain,
} from "./config"
import { cluster } from "./shared"
import { scansBucket } from "./storage"

const COLLAB_PORT = 1234

/**
 * Hocuspocus collaborative editing server.
 *
 * Three deploy shapes, gated on `$dev` (sst dev mode) and `hasStageVpc`:
 *
 *   sst dev (any stage)  → DevCommand spawns `bun --hot` locally as a dev
 *                           tab; the Linkable resolves
 *                           `Resource.HocuspocusServer.url` to
 *                           `http://localhost:1234`. No cloud resources
 *                           are provisioned for this stage's collab —
 *                           personal dev stages pay nothing.
 *   Permanent stage      → Service deployed behind ALB at custom domain.
 *                           Production runs always-on (autoscale 1→4).
 *                           Non-prod permanent stages (today: `development`)
 *                           deploy with desiredCount=0 and let the web app
 *                           scale them up on demand — see CollabServiceRef
 *                           below and the scale-down cron in `crons.ts`.
 *   Non-permanent, non-dev (PR preview)
 *                        → Linkable to shared development collab URL.
 *                           Per-document isolation via stage-prefixed
 *                           document names.
 *
 *   Production       → https://collab.getdeepmark.com
 *   Development      → https://collab.dev.getdeepmark.com (shared by PR stages)
 *   PR preview       → points to development URL above
 *   sst dev          → http://localhost:1234 (regardless of stage)
 */

const collabDomain = subdomain("collab")

/**
 * URL that non-permanent, non-dev stages connect to. Points at production's
 * collab service today — once a `development` stage is deployed, switch
 * this to `https://collab.dev.${baseDomain}` so non-prod traffic stays out
 * of the prod Hocuspocus task.
 */
const sharedCollabUrl = `https://collab.${baseDomain}`

const localCollabUrl = `http://localhost:${COLLAB_PORT}`

/**
 * SSM parameter that publishes the dev (permanent non-prod) collab service
 * coordinates so PR/personal stages can address the same Fargate service
 * for scale-up calls without spinning up their own VPC. Stored as
 * `<clusterArn>|<serviceName>` because SSM String params are flat strings
 * and JSON wins us nothing here.
 */
const COLLAB_SERVICE_REF_PARAM = "/deepmark/collab/service-ref"

const collabService =
	$dev || _PRODUCTION_
		? undefined
		: hasStageVpc
			? // Non-prod stage that opted into its own VPC + cluster (none today
				// — flip `hasStageVpc` on for any stage that needs an isolated
				// collab plane). Owns its own cluster/service.
				new sst.aws.Service("HocuspocusServer", {
					// biome-ignore lint/style/noNonNullAssertion: cluster is defined on permanent stages (see infra/shared.ts)
					cluster: cluster!,
					image: {
						context: ".",
						dockerfile: "packages/collab-server/Dockerfile",
					},
					link: [scansBucket, authUrlLink, collabServiceSecret],
					environment: {
						COLLAB_AUTHZ_URL: collabAuthz.url,
					},
					loadBalancer: {
						ports: [{ listen: "443/https", forward: `${COLLAB_PORT}/http` }],
						domain: {
							name: collabDomain,
							dns: sst.aws.dns({ zone: hostedZoneId }),
						},
					},
					// min=max=1 + utilization tracking disabled means SST creates the
					// service and an autoscaling Target with no scaling policies. The
					// transforms below then drive desiredCount and the Target's
					// minCapacity to 0 so manual UpdateService(0) calls stick instead
					// of being clawed back by Application Auto Scaling.
					scaling: {
						min: 1,
						max: 1,
						cpuUtilization: false,
						memoryUtilization: false,
					},
					cpu: "0.25 vCPU",
					memory: "0.5 GB",
					transform: {
						service: (args) => {
							args.desiredCount = 0
							args.waitForSteadyState = false
						},
						autoScalingTarget: (args) => {
							args.minCapacity = 0
							args.maxCapacity = 1
						},
					},
				})
			: undefined

export const collabServer = $dev
	? new sst.Linkable("HocuspocusServer", {
			properties: { url: localCollabUrl },
		})
	: _PRODUCTION_
		? new sst.aws.Service("HocuspocusServer", {
				// biome-ignore lint/style/noNonNullAssertion: cluster is defined on permanent stages (see infra/shared.ts)
				cluster: cluster!,
				image: {
					context: ".",
					dockerfile: "packages/collab-server/Dockerfile",
				},
				link: [scansBucket, authUrlLink, collabServiceSecret],
				environment: {
					COLLAB_AUTHZ_URL: collabAuthz.url,
				},
				loadBalancer: {
					ports: [{ listen: "443/https", forward: `${COLLAB_PORT}/http` }],
					domain: {
						name: collabDomain,
						dns: sst.aws.dns({ zone: hostedZoneId }),
					},
				},
				scaling: { min: 1, max: 4, cpuUtilization: 70 },
				cpu: "0.25 vCPU",
				memory: "0.5 GB",
			})
		: collabService
			? collabService
			: new sst.Linkable("HocuspocusServer", {
					properties: { url: sharedCollabUrl },
				})

if ($dev) {
	// sst dev — spawn a local Hocuspocus process. Cluster + VPC are NOT
	// referenced; this avoids provisioning ~$6/mo of NAT cost per dev stage.
	// The Linkable above resolves `Resource.HocuspocusServer.url` to localhost
	// so the Lambda + web both connect locally.
	new sst.x.DevCommand("HocuspocusDev", {
		dev: {
			command: "bun run dev",
			directory: "packages/collab-server",
			autostart: true,
		},
		environment: {
			COLLAB_AUTHZ_URL: collabAuthz.url,
		},
		link: [scansBucket, authUrlLink, collabServiceSecret],
	})
}

/**
 * Permanent non-prod stages publish their (cluster ARN, service name) tuple
 * to SSM so PR/personal stages can call UpdateService on the same service
 * without provisioning their own VPC. The web app and scale-down cron read
 * this via `collabServiceRef` below.
 */
if (collabService && !_PRODUCTION_) {
	new aws.ssm.Parameter("CollabServiceRefParam", {
		name: COLLAB_SERVICE_REF_PARAM,
		type: "String",
		// biome-ignore lint/style/noNonNullAssertion: cluster is defined on permanent stages
		value: $interpolate`${cluster!.nodes.cluster.arn}|${collabService.nodes.service.name}`,
		overwrite: true,
	})
}

/**
 * Resolves to `{ clusterArn, serviceName }` for a stage's collab Service —
 * used by the web app + scale-down cron to call ECS UpdateService.
 *
 * Currently defined ONLY when a stage owns its own collabService (i.e.
 * `hasStageVpc && !_PRODUCTION_`, which is no stage today). Production
 * doesn't expose scale-up (always-on); stages without their own Service
 * have nothing local to scale and don't reach into another stage's plane.
 *
 * The SSM-based cross-stage lookup that used to live here was tied to a
 * design where development published its (cluster, service) tuple for PR
 * stages to scale. With dev no longer owning a Service, no one publishes
 * — so consumers get `undefined` and skip the scale-up flow gracefully.
 * Both `crons.ts` and `web.ts` already guard on truthiness.
 */
export const collabServiceRef = collabService
	? new sst.Linkable("CollabServiceRef", {
			properties: {
				// biome-ignore lint/style/noNonNullAssertion: collabService implies cluster
				clusterArn: cluster!.nodes.cluster.arn,
				serviceName: collabService.nodes.service.name,
			},
		})
	: undefined
