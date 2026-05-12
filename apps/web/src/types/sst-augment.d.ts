// Manual augmentation for the SST `Resource` interface.
//
// `Resource.CollabServiceRef` is only created on real deploys to non-prod
// stages (see infra/collab.ts). `sst dev` never synthesizes it, so SST
// never types it in `sst-env.d.ts` — but `@/lib/collab/scale` (the
// non-prod-only on-demand collab scale-up server actions) still needs to
// compile against this shape.

declare module "sst" {
	export interface Resource {
		CollabServiceRef?: {
			type: "sst.sst.Linkable"
			clusterArn: string
			serviceName: string
		}
	}
}

export {}
