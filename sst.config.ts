/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
	app(input) {
		return {
			name: "deepmark",
			removal: input?.stage === "production" ? "retain" : "remove",
			home: "aws",
			providers: {
				aws: { region: "eu-west-2" },
				neon: { version: "0.9.0", apiKey: process.env.NEON_API_KEY! },
			},
		}
	},
	async run() {
		const { interactions, web } = await import("./infra")

		return { interactions: interactions.url, web: web.url }
	},
})
