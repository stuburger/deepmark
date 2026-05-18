// Manual augmentation for the SST `Resource` interface.
//
// `Resource.CollabServiceRef` is ALWAYS synthesised (see infra/collab.ts).
// On stages without a real collab Service the properties are empty
// strings; consumers detect the placeholder via empty values and bail.

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
