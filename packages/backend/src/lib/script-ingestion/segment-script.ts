import { concurrencyLimit } from "@/lib/concurrency"
import { callLlmWithFallback } from "@/lib/infra/llm-runtime"
import { logger } from "@/lib/infra/logger"
import { outputSchema } from "@/lib/infra/output-schema"
import {
	type VisionToken,
	runVisionOcr,
} from "@/lib/scan-extraction/cloud-vision-ocr"
import { generateText } from "ai"
import {
	type PageTextBlock,
	SegmentationSchema,
	buildSegmentationPrompt,
} from "./segment-script-prompt"

const TAG = "segment-script"

/** Tokens whose yMin is in the top 15% of page (bbox normalised to 0–1000). */
const TOP_REGION_Y_MAX = 150

// I/O-bound (HTTPS to Cloud Vision). Each in-flight call holds the page JPEG
// + base64 string + response (~1 MB peak). At 16 concurrent: ~16 MB peak,
// ~8 RPS effective — well under the Vision default quota of 30 RPS.
// Tuned 8 → 16 after the 8-concurrency run timed out: 700 pages / 8 × ~2s
// per call = 175 s for Vision alone, which left no budget for extract.
const VISION_OCR_CONCURRENCY = 16

export type SegmentPageInput = {
	order: number
	jpegBuffer: Buffer | null
}

export type SegmentedScript = {
	startPage: number
	endPage: number
	studentName: string | null
}

/** Shape of one script as emitted by the LLM, before ranges are derived. */
type RawSegmentedScript = {
	pageCount: number
	studentName: string | null
}

export type SegmentPdfScriptsResult = {
	scripts: SegmentedScript[]
}

export async function segmentPdfScripts(
	pages: SegmentPageInput[],
): Promise<SegmentPdfScriptsResult> {
	if (pages.length === 0) {
		return { scripts: [] }
	}

	const sortedPages = [...pages].sort((a, b) => a.order - b.order)
	const totalPages = sortedPages.length

	// Run Cloud Vision on every page that has image content. Pages already
	// flagged blank by upstream ink-density detection skip the Vision call.
	// Bounded concurrency: see VISION_OCR_CONCURRENCY above.
	const pageTexts = await concurrencyLimit(
		VISION_OCR_CONCURRENCY,
		sortedPages,
		async (p): Promise<PageTextBlock> => {
			if (!p.jpegBuffer) return { order: p.order, empty: true }
			const result = await runVisionOcr(
				p.jpegBuffer.toString("base64"),
				"image/jpeg",
			).catch((err) => {
				logger.warn(TAG, "Cloud Vision failed for page — treating as blank", {
					order: p.order,
					error: String(err),
				})
				return { rawResponse: null, tokens: [] as VisionToken[] }
			})
			if (result.tokens.length === 0) {
				return { order: p.order, empty: true }
			}
			return {
				order: p.order,
				empty: false,
				top: reconstructRegionText(result.tokens, "top"),
				body: reconstructRegionText(result.tokens, "body"),
			}
		},
	)

	// A page is blank if upstream flagged it OR Cloud Vision returned no tokens.
	const blankIndices = pageTexts.filter((p) => p.empty).map((p) => p.order)
	const prompt = buildSegmentationPrompt({
		totalPages,
		blankIndices,
		pages: pageTexts,
	})

	const attempt = async (): Promise<SegmentedScript[]> => {
		const { output } = await callLlmWithFallback(
			"pdf-script-segmentation",
			async (model, entry, report) => {
				const result = await generateText({
					model,
					temperature: entry.temperature,
					messages: [{ role: "user", content: prompt }],
					output: outputSchema(SegmentationSchema),
				})
				report.usage = result.usage
				return result
			},
		)

		const raw = lengthsToRanges(
			output.scripts.map(
				(s): RawSegmentedScript => ({
					pageCount: s.pageCount,
					studentName:
						typeof s.studentName === "string" && s.studentName.trim()
							? s.studentName.trim()
							: null,
				}),
			),
		)
		return snapBlankStartPages(raw, new Set(blankIndices), totalPages)
	}

	let scripts = await attempt()
	let validation = validateScripts(scripts, totalPages)
	if (!validation.ok) {
		logger.warn(TAG, "Segmentation output failed validation — retrying once", {
			totalPages,
			reason: validation.error,
			scripts,
		})
		scripts = await attempt()
		validation = validateScripts(scripts, totalPages)
		if (!validation.ok) {
			throw new Error(
				`Segmentation output invalid after retry: ${validation.error}`,
			)
		}
	}

	return { scripts }
}

function reconstructRegionText(
	tokens: VisionToken[],
	region: "top" | "body",
): string {
	const filtered = tokens.filter((t) => {
		const yMin = t.bbox[0]
		return region === "top" ? yMin < TOP_REGION_Y_MAX : yMin >= TOP_REGION_Y_MAX
	})
	if (filtered.length === 0) return ""

	// Sort by reading order, then group into lines.
	const sorted = [...filtered].sort(
		(a, b) =>
			a.para_index - b.para_index ||
			a.line_index - b.line_index ||
			a.word_index - b.word_index,
	)

	const lines: string[] = []
	let currentLine: string[] = []
	let currentKey = ""
	for (const t of sorted) {
		const key = `${t.para_index}:${t.line_index}`
		if (key !== currentKey) {
			if (currentLine.length > 0) lines.push(currentLine.join(" "))
			currentLine = []
			currentKey = key
		}
		currentLine.push(t.text_raw)
	}
	if (currentLine.length > 0) lines.push(currentLine.join(" "))

	return lines.join("\n")
}

/**
 * The model periodically places a startPage on a blank page — that's always
 * wrong (blanks are unused answer space belonging to the preceding student).
 * Walk each startPage forward past any blanks. The previous script's endPage
 * is extended to absorb the skipped blanks. Duplicates that collide after
 * snapping are dropped.
 */
function snapBlankStartPages(
	scripts: SegmentedScript[],
	blankSet: Set<number>,
	totalPages: number,
): SegmentedScript[] {
	const snappedStarts: number[] = scripts.map((s) => {
		let i = s.startPage
		while (i < totalPages && blankSet.has(i)) i++
		return i
	})

	const result: SegmentedScript[] = []
	for (let i = 0; i < scripts.length; i++) {
		const start = snappedStarts[i]
		if (start === undefined || start >= totalPages) continue
		if (i > 0 && start === snappedStarts[i - 1]) continue // collision — drop

		const nextStart =
			snappedStarts.slice(i + 1).find((s) => s > start) ?? totalPages
		const curr = scripts[i]
		if (!curr) continue
		result.push({
			startPage: start,
			endPage: nextStart - 1,
			studentName: curr.studentName,
		})
	}
	return result
}

function lengthsToRanges(scripts: RawSegmentedScript[]): SegmentedScript[] {
	let cursor = 0
	return scripts.map((s) => {
		const start = cursor
		const end = cursor + s.pageCount - 1
		cursor = end + 1
		return { startPage: start, endPage: end, studentName: s.studentName }
	})
}

type ValidationResult = { ok: true } | { ok: false; error: string }

export function validateScripts(
	scripts: SegmentedScript[],
	totalPages: number,
): ValidationResult {
	if (scripts.length === 0) {
		return { ok: false, error: "no scripts returned" }
	}

	const last = scripts[scripts.length - 1]
	if (!last) return { ok: false, error: "last script missing" }

	if (last.endPage !== totalPages - 1) {
		const covered = last.endPage + 1
		return {
			ok: false,
			error: `scripts cover ${covered} pages but PDF has ${totalPages}`,
		}
	}

	return { ok: true }
}
