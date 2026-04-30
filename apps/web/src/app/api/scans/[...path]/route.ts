import { routeHandler } from "@/lib/authz"

/**
 * Legacy scan proxy — disabled. Use submission-scoped or batch-scoped routes:
 * - `/api/submissions/[submissionId]/scan-pages/[pageOrder]`
 * - `/api/batch/[batchId]/staged-scripts/[scriptId]/scan-pages/[pageOrder]`
 */
export const GET = routeHandler.public<{ path: string[] }>(async () => {
	return new Response("Not found", { status: 404 })
})
