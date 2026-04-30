import type { NextRequest } from "next/server"

/**
 * Legacy scan proxy — disabled. Use submission-scoped or batch-scoped routes:
 * - `/api/submissions/[submissionId]/scan-pages/[pageOrder]`
 * - `/api/batch/[batchId]/staged-scripts/[scriptId]/scan-pages/[pageOrder]`
 */
export async function GET(_request: NextRequest) {
	return new Response("Not found", { status: 404 })
}
