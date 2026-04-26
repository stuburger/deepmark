/**
 * Hocuspocus document-name format used across the web client, the
 * collab-server, and the headless editor in backend Lambdas.
 *
 *   `${stage}:${kind}:${id}`
 *
 * Stage prefixing isolates documents across SST stages that may share a
 * Hocuspocus instance (e.g. PR previews pointing at a shared development
 * server). The collab-server's `onAuthenticate` parses the prefix; the
 * projection Lambda filters by it; the S3 snapshot key carries it
 * verbatim (`yjs/${name}.bin`).
 *
 * This is the single source of truth — the web client (NEXT_PUBLIC_STAGE),
 * backend Lambdas (STAGE), and the collab-server (parser only) all import
 * from here. Don't duplicate.
 */

export type DocumentKind = "submission"

export type ParsedDocumentName = {
	stage: string
	kind: DocumentKind
	id: string
}

export function buildSubmissionDocumentName(
	stage: string,
	submissionId: string,
): string {
	return `${stage}:submission:${submissionId}`
}

export function parseDocumentName(name: string): ParsedDocumentName | null {
	const parts = name.split(":")
	if (parts.length !== 3) return null
	const [stage, kind, id] = parts
	if (!stage || !id) return null
	if (kind !== "submission") return null
	return { stage, kind, id }
}
