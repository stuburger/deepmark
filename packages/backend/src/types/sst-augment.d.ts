// Manual augmentation for the SST `Resource` interface.
//
// `Resource.CollabServiceRef` is only created on real deploys to non-prod
// stages (see infra/collab.ts). `sst dev` never synthesizes it, so SST
// never types it in `sst-env.d.ts` — but `processors/collab-scale-down.ts`
// still needs to compile against this shape.

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
