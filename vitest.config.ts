import path from "node:path"
import tsconfigPaths from "vite-tsconfig-paths"
import { defineConfig } from "vitest/config"

const backendRoot = path.resolve(__dirname, "packages/backend")
const webRoot = path.resolve(__dirname, "apps/web")

const backendTsconfigPaths = tsconfigPaths({
	root: backendRoot,
	projects: ["tsconfig.json"],
})

const webTsconfigPaths = tsconfigPaths({
	root: webRoot,
	projects: ["tsconfig.json"],
})

export default defineConfig({
	test: {
		projects: [
			{
				test: {
					name: "shared:unit",
					root: path.resolve(__dirname, "packages/shared"),
					include: ["tests/unit/**/*.test.ts"],
					testTimeout: 10_000,
					hookTimeout: 5_000,
				},
			},
			{
				plugins: [backendTsconfigPaths],
				test: {
					name: "backend:unit",
					root: backendRoot,
					include: ["tests/unit/**/*.test.ts"],
					testTimeout: 10_000,
					hookTimeout: 5_000,
				},
			},
			{
				plugins: [backendTsconfigPaths],
				test: {
					name: "backend:integration",
					root: backendRoot,
					include: ["tests/integration/**/*.test.ts"],
					exclude: ["tests/integration/**/*.smoke.test.ts"],
					testTimeout: 180_000,
					hookTimeout: 30_000,
					pool: "forks",
				},
			},
			// Smoke tests invoke deployed Lambdas directly (real AWS conditions)
			// and cost real money per run (~$3 for the GWAUGH 700-page fixture).
			// Opt-in only — never part of `bun test:integration`.
			//
			// testTimeout = Lambda max (4 min) + 1 min margin for setup/teardown.
			// If the Lambda hits its own wall, the test should fail within ~5 min.
			{
				plugins: [backendTsconfigPaths],
				test: {
					name: "backend:lambda-smoke",
					root: backendRoot,
					include: ["tests/integration/**/*.smoke.test.ts"],
					testTimeout: 300_000,
					hookTimeout: 60_000,
					pool: "forks",
				},
			},
			{
				plugins: [webTsconfigPaths],
				test: {
					name: "web:unit",
					root: webRoot,
					include: [
						"src/**/__tests__/**/*.test.ts",
						"scripts/**/__tests__/**/*.test.ts",
					],
					testTimeout: 10_000,
					hookTimeout: 5_000,
				},
			},
			{
				plugins: [webTsconfigPaths],
				test: {
					name: "web:integration",
					root: path.resolve(__dirname, "apps/web"),
					include: ["tests/integration/**/*.test.ts"],
					testTimeout: 180_000,
					hookTimeout: 30_000,
					pool: "forks",
				},
			},
		],
	},
})
