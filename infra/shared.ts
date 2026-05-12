import { hasStageVpc } from "./config"

/**
 * Shared VPC + ECS cluster for containerised services (Hocuspocus, future
 * workers).
 *
 * Production gets its own VPC + cluster and runs the collab Service in it.
 *
 * Every other stage (development, PR previews, personal stages) does NOT
 * create — or reference — VPC/cluster. They connect to production's
 * already-deployed Hocuspocus via its public ALB (see infra/collab.ts),
 * so there's nothing stage-local to wire up. Both exports are `undefined`
 * for those stages; collab.ts guards the references with `hasStageVpc`.
 *
 * NAT: uses `nat: "ec2"` — fck-nat-style NAT instances on t4g.nano (~$3/mo
 * per AZ, ~$6/mo total for 2 AZs). Tasks run in private subnets which is the
 * conventional ECS pattern; managed NAT would be ~$33/mo per AZ and is
 * overkill at this scale.
 */

export const vpc = hasStageVpc
	? new sst.aws.Vpc("Vpc", { az: 2, nat: "ec2" })
	: undefined

export const cluster = hasStageVpc
	? // biome-ignore lint/style/noNonNullAssertion: vpc is defined when hasStageVpc is true
		new sst.aws.Cluster("Cluster", { vpc: vpc! })
	: undefined
