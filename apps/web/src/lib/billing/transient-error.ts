import { Prisma } from "@mcp-gcse/db"

/**
 * Prisma error codes that indicate the database / connection is temporarily
 * unhealthy — the same operation is likely to succeed on a retry. Anything
 * else (validation errors, unique-constraint violations, missing rows) is
 * treated as permanent: retrying won't help and we'd just keep failing on
 * every webhook delivery.
 *
 *   P1001 — can't reach database
 *   P1002 — connection timeout
 *   P1008 — operations timed out
 *   P1017 — server closed the connection
 *   P2024 — connection-pool timeout
 *   P2034 — transaction conflict (deadlock; retry usually wins)
 */
const TRANSIENT_PRISMA_CODES = new Set([
	"P1001",
	"P1002",
	"P1008",
	"P1017",
	"P2024",
	"P2034",
])

/**
 * Should the webhook return 5xx (let Stripe retry) instead of 200 (swallow)?
 * Conservative — only true for errors we have strong reason to believe will
 * succeed on retry.
 */
export function isTransientError(err: unknown): boolean {
	if (err instanceof Prisma.PrismaClientKnownRequestError) {
		return TRANSIENT_PRISMA_CODES.has(err.code)
	}
	if (err instanceof Prisma.PrismaClientInitializationError) return true
	if (err instanceof Prisma.PrismaClientRustPanicError) return true
	return false
}
