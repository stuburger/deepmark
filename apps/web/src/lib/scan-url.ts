/**
 * Build the in-app proxy URL for an S3 scan object.
 * Path segments are encoded individually so slashes stay as path
 * separators while special characters in filenames are escaped.
 */
export function scanProxyUrl(s3Key: string): string {
	return `/api/scans/${s3Key.split("/").map(encodeURIComponent).join("/")}`
}
