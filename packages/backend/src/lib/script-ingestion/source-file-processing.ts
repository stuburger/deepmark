import { logger } from "@/lib/infra/logger"
import { s3 } from "@/lib/infra/s3"
import {
	classifyBoundariesScriptPageMode,
	classifyBoundariesSeparatorMode,
} from "@/lib/script-ingestion/boundary-classification"
import { extractNames } from "@/lib/script-ingestion/name-extraction"
import { extractPdfPages, fetchS3Bytes } from "@/lib/script-ingestion/pdf-pages"
import type { PageData, StagedScriptData } from "@/lib/script-ingestion/types"
import { guessMime } from "@/lib/script-ingestion/utils"
import { ListObjectsV2Command } from "@aws-sdk/client-s3"
import type { BlankPageMode } from "@mcp-gcse/db"
import { Resource } from "sst"

const TAG = "batch-classify"

// ─── S3 source listing ───────────────────────────────────────────────────────

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

// ─── Process source file with boundary classification ────────────────────────

export async function processSourceFile(
	batchJobId: string,
	sourceKey: string,
	blankPageMode: BlankPageMode,
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
					hasUncertainPage: false,
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

	const blankIndices = new Set(
		pages.filter((p) => p.jpegBuffer === null).map((p) => p.absoluteIndex),
	)
	const nonBlankIndices = pages
		.filter((p) => p.jpegBuffer !== null)
		.map((p) => p.absoluteIndex)

	logger.info(TAG, "Blank detection complete", {
		total: pages.length,
		blank: blankIndices.size,
	})

	let groups: PageData[][]
	if (blankPageMode === "separator") {
		const classified = classifyBoundariesSeparatorMode(pages, blankIndices)
		groups = classified.map((g) => g.pages)
		return buildScripts(classified, sourceKey, pages.length)
	}

	const classified = await classifyBoundariesScriptPageMode(
		pages,
		blankIndices,
		nonBlankIndices,
	)

	await extractNames(classified)

	return buildScripts(classified, sourceKey, pages.length)
}

function buildScripts(
	groups: Array<{
		pages: PageData[]
		proposedName: string | null
		confidence: number
		hasUncertainPage: boolean
	}>,
	sourceKey: string,
	totalPages: number,
): { scripts: StagedScriptData[]; pageCount: number } {
	const scripts: StagedScriptData[] = groups
		.map((g) => {
			const contentPages = g.pages.filter((p) => p.jpegKey !== null)
			return {
				page_keys: contentPages.map((p, i) => ({
					s3_key: p.jpegKey as string,
					order: i + 1,
					mime_type: "image/jpeg",
					source_file: sourceKey,
				})),
				proposed_name: g.proposedName,
				confidence: g.confidence,
				hasUncertainPage: g.hasUncertainPage,
			}
		})
		.filter((s) => s.page_keys.length > 0)

	return { scripts, pageCount: totalPages }
}

// ─── Per-file mode: one StagedScript per source file, no Gemini calls ────────

/**
 * In per_file mode the user asserts that each uploaded file is a single
 * student's script. We still extract PDF pages to JPEGs (so the staging
 * preview and OCR pipeline work), but skip all boundary classification.
 *
 * An oversized script (page count > pages_per_script * 2) sets
 * hasUncertainPage=true, which forces staging so the teacher can split it.
 */
export async function processSourceFilePerFile(
	batchJobId: string,
	sourceKey: string,
	pagesPerScript: number,
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
					hasUncertainPage: false,
				},
			],
			pageCount: 1,
		}
	}

	const pdfBytes = await fetchS3Bytes(Resource.ScansBucket.name, sourceKey)
	const pages = await extractPdfPages(pdfBytes, batchJobId, sourceKey)

	const contentPages = pages.filter((p) => p.jpegKey !== null)

	if (contentPages.length === 0) {
		return { scripts: [], pageCount: pages.length }
	}

	const isOversized = contentPages.length > pagesPerScript * 2

	const script: StagedScriptData = {
		page_keys: contentPages.map((p, i) => ({
			s3_key: p.jpegKey as string,
			order: i + 1,
			mime_type: "image/jpeg",
			source_file: sourceKey,
		})),
		proposed_name: null,
		confidence: 1.0,
		hasUncertainPage: isOversized,
	}

	if (isOversized) {
		logger.warn(TAG, "Oversized script detected in per_file mode", {
			batchJobId,
			sourceKey,
			pageCount: contentPages.length,
			pagesPerScript,
		})
	}

	return { scripts: [script], pageCount: pages.length }
}
