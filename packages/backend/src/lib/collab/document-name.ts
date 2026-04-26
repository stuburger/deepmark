import { buildSubmissionDocumentName as build } from "@mcp-gcse/shared"

/**
 * Hocuspocus document name for a submission's collaborative Y.Doc.
 *
 * Format and stage isolation rules live in `@mcp-gcse/shared/collab`. This
 * file is a thin env-aware wrapper: STAGE is resolved on every call rather
 * than at module load. Lambda subscribers receive STAGE via `environment:`
 * in `infra/queues.ts`; the integration test process doesn't get it from
 * `sst shell` and sets it explicitly in beforeAll so its observer connects
 * to the same doc as the Lambdas.
 */
export function buildSubmissionDocumentName(submissionId: string): string {
	const stage = process.env.STAGE ?? "dev"
	return build(stage, submissionId)
}
