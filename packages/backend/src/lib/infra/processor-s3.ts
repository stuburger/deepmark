import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3"

const s3 = new S3Client({})

/**
 * Fetches an S3 object and returns its contents as a base64 string.
 * Used by PDF processor lambdas to pass documents to Gemini.
 */
export async function getPdfBase64(
	bucket: string,
	key: string,
): Promise<string> {
	const cmd = new GetObjectCommand({ Bucket: bucket, Key: key })
	const response = await s3.send(cmd)
	const body = await response.Body?.transformToByteArray()
	if (!body?.length) throw new Error("Empty S3 object")
	return Buffer.from(body).toString("base64")
}

/**
 * Extracts the job id from an S3 key of the form:
 *   pdfs/<docType>/<jobId>/document.pdf
 *
 * Throws if the key does not match the expected structure.
 */
export function parseJobIdFromKey(key: string, docType: string): string {
	const decoded = decodeURIComponent(key)
	const parts = decoded.split("/")
	if (parts.length < 4 || parts[0] !== "pdfs" || parts[1] !== docType) {
		throw new Error(`Unexpected S3 key format for docType "${docType}": ${key}`)
	}
	return parts[2] ?? ""
}
