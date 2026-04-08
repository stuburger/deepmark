import { logger } from "@/lib/infra/logger"
import { s3 } from "@/lib/infra/s3"
import type { VisionPageResult } from "@/lib/scan-extraction/cloud-vision-ocr"
import { PutObjectCommand } from "@aws-sdk/client-s3"

const TAG = "student-paper-extract"

type SortedPage = {
	order: number
}

/**
 * Saves raw Cloud Vision API responses to S3 for debugging/auditing.
 * Non-fatal — logs and swallows errors.
 */
export async function saveVisionRaw(
	jobId: string,
	bucket: string,
	sortedPages: SortedPage[],
	visionResults: (VisionPageResult | null)[],
): Promise<string> {
	const visionRawKey = `scans/${jobId}/vision-raw.json`
	const visionRawPayload = {
		pages: visionResults.map((result, i) => {
			const pageOrder = sortedPages[i]?.order
			if (pageOrder == null) {
				throw new Error(
					`sortedPages[${i}] is undefined while building visionRawPayload — arrays are out of sync`,
				)
			}
			return {
				page_order: pageOrder,
				response: result?.rawResponse ?? null,
			}
		}),
	}

	try {
		await s3.send(
			new PutObjectCommand({
				Bucket: bucket,
				Key: visionRawKey,
				Body: JSON.stringify(visionRawPayload),
				ContentType: "application/json",
			}),
		)
		logger.info(TAG, "Raw Cloud Vision output saved to S3", {
			jobId,
			key: visionRawKey,
		})
	} catch (err) {
		logger.error(TAG, "Failed to save raw Vision output to S3 — non-fatal", {
			jobId,
			error: String(err),
		})
	}

	return visionRawKey
}
