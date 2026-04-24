import { authUrlLink } from "./auth"
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
 * Permanent stages (production, development) deploy the Service behind an ALB
 * at a custom domain. PR preview / personal stages connect to the development
 * stage's Hocuspocus instance — isolation is per-document via stage-prefixed
 * document names, not per-network.
 *
 * In `sst dev` the container is NOT deployed; instead `dev.command` launches
 * `bun --hot` locally in an sst dev tab. `Resource.HocuspocusServer.url`
 * resolves to `http://localhost:1234` — web and backend just swap `http->ws`
 * at the call site.
 *
 *   Production        → https://collab.getdeepmark.com
 *   Development       → https://collab.dev.getdeepmark.com (shared by PR stages)
 *   PR / personal     → points to the development URL above
 *   sst dev           → http://localhost:1234
 */

const collabDomain = subdomain("collab")

/**
 * URL that non-permanent stages connect to. Points at production's collab
 * service today — once a `development` stage is deployed, switch this to
 * `https://collab.dev.${baseDomain}` so non-prod traffic stays out of the
 * prod Hocuspocus task.
 */
const sharedCollabUrl = `https://collab.${baseDomain}`

export const collabServer = isPermanentStage
	? new sst.aws.Service("HocuspocusServer", {
			// biome-ignore lint/style/noNonNullAssertion: cluster is defined on permanent stages (see infra/shared.ts)
			cluster: cluster!,
			image: { context: "./packages/collab-server" },
			link: [scansBucket, authUrlLink, collabServiceSecret],
			loadBalancer: {
				ports: [{ listen: "443/https", forward: `${COLLAB_PORT}/http` }],
				domain: {
					name: collabDomain,
					dns: sst.aws.dns({ zone: hostedZoneId }),
				},
			},
			dev: {
				command: "bun run dev",
				directory: "packages/collab-server",
				url: `http://localhost:${COLLAB_PORT}`,
				autostart: true,
			},
			scaling: { min: 1, max: 4, cpuUtilization: 70 },
			cpu: "0.25 vCPU",
			memory: "0.5 GB",
		})
	: new sst.Linkable("HocuspocusServer", {
			properties: { url: sharedCollabUrl },
		})
