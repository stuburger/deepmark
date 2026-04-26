import { logger } from "@/lib/infra/logger"
import { s3 } from "@/lib/infra/s3"
import { extractPdfPages, fetchS3Bytes } from "@/lib/script-ingestion/pdf-pages"
import { segmentPdfScripts } from "@/lib/script-ingestion/segment-script"
import type { PageKey, StagedScriptData } from "@/lib/script-ingestion/types"
import { guessMime } from "@/lib/script-ingestion/utils"
import { ListObjectsV2Command } from "@aws-sdk/client-s3"
import { Resource } from "sst"

const TAG = "batch-classify"

export async function listSourceFiles(batchJobId: string): Promise<string[]> {
	const prefix = `batches/${batchJobId}/source/`
	const result = await s3.send(
		new ListObjectsV2Command({
			Bucket: Resource.ScansBucket.name,
			Prefix: prefix,
		}),
	)
	return (result.Contents ?? [])
		.map((obj) => obj.Key as string)
		.filter(Boolean)
		.sort()
}

/**
 * Processes a single uploaded source file into staged scripts.
 *
 * - Non-PDFs (single images) are wrapped as a single-page single-script entry.
 *   The camera/phone upload flow will drive this path in future.
 * - PDFs are extracted into per-page JPEGs (uploaded to S3) and fed to the
 *   Cloud-Vision-backed segmentation model, which returns student script
 *   page ranges and names in a single LLM call.
 *
 * The caller always routes the resulting staged scripts through the teacher
 * review step; there is no auto-commit path.
 */
export async function processSourceFile(
	batchJobId: string,
	sourceKey: string,
): Promise<{ scripts: StagedScriptData[]; pageCount: number }> {
	const mime = guessMime(sourceKey)

	if (mime !== "application/pdf") {
		return {
			scripts: [
				{
					page_keys: [
						{
							s3_key: sourceKey,
							order: 1,
							mime_type: mime,
							source_file: sourceKey,
						},
					],
					proposed_name: null,
					confidence: 1.0,
				},
			],
			pageCount: 1,
		}
	}

	const pdfBytes = await fetchS3Bytes(Resource.ScansBucket.name, sourceKey)
	const pages = await extractPdfPages(pdfBytes, batchJobId, sourceKey)

	if (pages.length === 0) {
		return { scripts: [], pageCount: 0 }
	}

	const { scripts: segmented } = await segmentPdfScripts(
		pages.map((p) => ({ order: p.absoluteIndex, jpegBuffer: p.jpegBuffer })),
	)

	logger.info(TAG, "Segmentation complete", {
		sourceKey,
		pageCount: pages.length,
		scriptCount: segmented.length,
	})

	const pagesByIndex = new Map(pages.map((p) => [p.absoluteIndex, p]))

	const stagedScripts = segmented
		.map((script): StagedScriptData | null => {
			const pageKeys: PageKey[] = []
			let order = 1
			for (let i = script.startPage; i <= script.endPage; i++) {
				const page = pagesByIndex.get(i)
				if (!page || page.jpegKey === null) continue
				pageKeys.push({
					s3_key: page.jpegKey,
					order: order++,
					mime_type: "image/jpeg",
					source_file: sourceKey,
				})
			}
			if (pageKeys.length === 0) return null
			return {
				page_keys: pageKeys,
				proposed_name: script.studentName,
				confidence: 1.0,
			}
		})
		.filter((s): s is StagedScriptData => s !== null)

	return { scripts: stagedScripts, pageCount: pages.length }
}
