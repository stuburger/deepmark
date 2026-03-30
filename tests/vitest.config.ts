import { defineConfig } from "vitest/config"

export default defineConfig({
	test: {
		testTimeout: 180_000,
		hookTimeout: 30_000,
		pool: "forks",
		poolOptions: { forks: { singleFork: true } },
	},
})
