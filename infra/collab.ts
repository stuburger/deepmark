import { authUrlLink } from "./auth"
import { collabAuthz } from "./authz"
import {
	baseDomain,
	collabServiceSecret,
	hostedZoneId,
	isPermanentStage,
	subdomain,
} from "./config"
import { cluster } from "./shared"
import { scansBucket } from "./storage"

const COLLAB_PORT = 1234

/**
 * Hocuspocus collaborative editing server.
 *
 * Three deploy shapes, gated on `$dev` (sst dev mode) and `isPermanentStage`:
 *
 *   sst dev (any stage)  → DevCommand spawns `bun --hot` locally as a dev
 *                           tab; the Linkable resolves
 *                           `Resource.HocuspocusServer.url` to
 *                           `http://localhost:1234`. No cloud resources
 *                           are provisioned for this stage's collab —
 *                           personal dev stages pay nothing.
 *   Permanent stage      → Service deployed behind ALB at custom domain.
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

if ($dev) {
	// sst dev — spawn a local Hocuspocus process. Cluster + VPC are NOT
	// referenced; this avoids provisioning ~$6/mo of NAT cost per dev stage.
	// The Linkable below resolves `Resource.HocuspocusServer.url` to localhost
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

export const collabServer = $dev
	? new sst.Linkable("HocuspocusServer", {
			properties: { url: localCollabUrl },
		})
	: isPermanentStage
		? new sst.aws.Service("HocuspocusServer", {
				// biome-ignore lint/style/noNonNullAssertion: cluster is defined on permanent stages (see infra/shared.ts)
				cluster: cluster!,
				// Build context is the monorepo root so Bun can resolve the
				// `workspace:*` dep on @mcp-gcse/shared during `bun install`.
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
		: new sst.Linkable("HocuspocusServer", {
				properties: { url: sharedCollabUrl },
			})
