import { type PrismaClient, createPrismaClient } from "@mcp-gcse/db"
import { Resource } from "sst"

// Shared Prisma client for the web app. Colocating one instance avoids the
// pool-per-file problem where each `@/lib/**/{queries,mutations}.ts` used to
// `createPrismaClient(...)` at module scope and accumulate its own Neon
// connection pool. The stash on globalThis protects against Next.js dev-mode
// hot-reload churn; in Lambda each cold start gets a fresh process anyway.
const globalForPrisma = globalThis as unknown as { __db?: PrismaClient }

export const db: PrismaClient =
	globalForPrisma.__db ?? createPrismaClient(Resource.NeonPostgres.databaseUrl)

if (process.env.NODE_ENV !== "production") {
	globalForPrisma.__db = db
}
