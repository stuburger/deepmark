/**
 * Scan image URL for a committed student submission page (authz-bound).
 */
export function submissionScanPageUrl(
	submissionId: string,
	pageOrder: number,
): string {
	return `/api/submissions/${encodeURIComponent(submissionId)}/scan-pages/${pageOrder}`
}

/**
 * Scan image URL for a staged script page during batch review (authz-bound).
 */
export function stagedScriptScanPageUrl(
	batchId: string,
	scriptId: string,
	pageOrder: number,
): string {
	return `/api/batch/${encodeURIComponent(batchId)}/staged-scripts/${encodeURIComponent(scriptId)}/scan-pages/${pageOrder}`
}
