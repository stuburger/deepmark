/**
 * Document names follow the format: `${stage}:${kind}:${id}`
 *
 * Stage prefixing isolates documents across shared non-prod stages that
 * all connect to the same Hocuspocus instance.
 *
 * Examples:
 *   - "stuartbourhill:submission:clsx9abc123"
 *   - "production:submission:clsx9abc456"
 */
export type ParsedDocumentName = {
	stage: string
	kind: "submission"
	id: string
}

export function parseDocumentName(name: string): ParsedDocumentName | null {
	const parts = name.split(":")
	if (parts.length !== 3) return null
	const [stage, kind, id] = parts
	if (!stage || !id) return null
	if (kind !== "submission") return null
	return { stage, kind, id }
}

export function buildDocumentName(
	stage: string,
	kind: "submission",
	id: string,
): string {
	return `${stage}:${kind}:${id}`
}
