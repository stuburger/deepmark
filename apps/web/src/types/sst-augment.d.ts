// Manual augmentation for the SST `Resource` interface.
//
// `Resource.CollabServiceRef` is ALWAYS synthesised (see infra/collab.ts).
// On stages without a real collab Service (production: always-on;
// personal `sst dev` stages: nothing local to scale) the properties are
// empty strings. Consumers detect the placeholder via empty values and
// short-circuit. SST doesn't always populate this in `sst-env.d.ts`
// during `sst dev` so we type it manually.

declare module "sst" {
	export interface Resource {
		CollabServiceRef: {
			type: "sst.sst.Linkable"
			clusterArn: string
			serviceName: string
		}
	}
}

export {}
