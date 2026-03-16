export const scansBucket = new sst.aws.Bucket("ScansBucket", {
	cors: {
		allowHeaders: ["*"],
		allowMethods: ["PUT"],
		allowOrigins: ["*"],
		maxAge: "1 hour",
	},
})
