export const scansBucket = new sst.aws.Bucket("ScansBucket", {
	cors: {
		allowHeaders: ["*"],
		allowMethods: ["PUT"],
		allowOrigins: ["*"],
		maxAge: "1 hour",
	},
	lifecycle: [
		{
			// Class PDF exports are throwaway downloads; presigned URLs only
			// live for 5 minutes anyway, so anything older is dead weight.
			id: "expire-pdf-exports",
			prefix: "pdf-exports/",
			expiresIn: "1 day",
		},
	],
})
