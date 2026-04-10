import path from "node:path"
import tsconfigPaths from "vite-tsconfig-paths"
import { defineConfig } from "vitest/config"

const backendRoot = path.resolve(__dirname, "packages/backend")

const backendTsconfigPaths = tsconfigPaths({
	root: backendRoot,
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
					testTimeout: 180_000,
					hookTimeout: 30_000,
					pool: "forks",
				},
			},
			{
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
