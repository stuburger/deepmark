import { isPermanentStage } from "./config"

/**
 * Shared VPC + ECS cluster for containerised services (Hocuspocus, future
 * workers).
 *
 * Permanent stages (production, development) create their own VPC + cluster
 * and deploy the collab Service into it.
 *
 * PR preview and personal stages do NOT create — or reference — VPC/cluster.
 * They connect to a permanent stage's already-deployed Hocuspocus via its
 * public ALB (see infra/collab.ts), so there's nothing stage-local to wire
 * up. Both exports are `undefined` for those stages; collab.ts guards the
 * references with `isPermanentStage`.
 *
 * NAT: uses `nat: "ec2"` — fck-nat-style NAT instances on t4g.nano (~$3/mo
 * per AZ, ~$6/mo total for 2 AZs). Tasks run in private subnets which is the
 * conventional ECS pattern; managed NAT would be ~$33/mo per AZ and is
 * overkill at this scale.
 */

export const vpc = isPermanentStage
	? new sst.aws.Vpc("Vpc", { az: 2, nat: "ec2" })
	: undefined

export const cluster = isPermanentStage
	? // biome-ignore lint/style/noNonNullAssertion: vpc is defined on permanent stages
		new sst.aws.Cluster("Cluster", { vpc: vpc! })
	: undefined
