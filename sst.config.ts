/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "mcp-gcse",
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",
      providers: {
        neon: { version: "0.9.0", apiKey: process.env.NEON_API_KEY! },
      },
    };
  },
  async run() {
    const { interactions, web } = await import("./infra")

    return { interactions: interactions.url, web: web.url }
  },
});
