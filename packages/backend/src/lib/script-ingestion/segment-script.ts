import { concurrencyLimit } from "@/lib/concurrency"
import { callLlmWithFallback } from "@/lib/infra/llm-runtime"
import { logger } from "@/lib/infra/logger"
import { outputSchema } from "@/lib/infra/output-schema"
import {
	type RawSegmentedScript,
	type SegmentedScript,
	lengthsToRanges,
	snapBlankStartPages,
	validateScripts,
} from "@/lib/script-ingestion/segmentation-transforms"
import { DEFAULT_LLM_TIMEOUT_MS } from "@mcp-gcse/shared"
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

export type SegmentPdfScriptsResult = {
	scripts: SegmentedScript[]
}

export type SegmentPdfScriptsOptions = {
	/**
	 * Throttled progress callback fired during the Cloud Vision OCR loop.
	 * Caller is responsible for any persistence (e.g. job_events writes).
	 */
	onVisionProgress?: (processed: number, total: number) => void
	/**
	 * Remaining-time-in-Lambda probe (`context.getRemainingTimeInMillis`).
	 * When provided, the segmentation LLM call's wall-clock budget is set
	 * to `remaining - 10s` (clamped to a 90s floor) so we bail before the
	 * Lambda is killed mid-call — that would otherwise leave an in-flight
	 * Gemini fetch un-cancelled and billed. When omitted (tests, web
	 * server actions, anywhere outside an SQS Lambda), the runner uses
	 * its default 90s budget.
	 */
	getRemainingTimeMs?: () => number
	/**
	 * Instrumentation hook: fired once per successful segmentation with
	 * prompt size, blank/script counts, LLM token usage, and elapsed
	 * wall-clock for the LLM call. Used by `segmentation-evals` to compare
	 * fixtures (e.g. why does a 700-page input segment in 16s while a
	 * 214-page input takes 95s).
	 */
	onSegmentationMetrics?: (m: {
		totalPages: number
		blankCount: number
		promptChars: number
		scriptCount: number
		inputTokens: number | undefined
		outputTokens: number | undefined
		llmElapsedMs: number
	}) => void
}

const SEGMENTATION_LAMBDA_HEADROOM_MS = 10_000

const VISION_PROGRESS_STRIDE = 50

export async function segmentPdfScripts(
	pages: SegmentPageInput[],
	options: SegmentPdfScriptsOptions = {},
): Promise<SegmentPdfScriptsResult> {
	if (pages.length === 0) {
		return { scripts: [] }
	}

	const sortedPages = [...pages].sort((a, b) => a.order - b.order)
	const totalPages = sortedPages.length

	// Run Cloud Vision on every page that has image content. Pages already
	// flagged blank by upstream ink-density detection skip the Vision call.
	// Bounded concurrency: see VISION_OCR_CONCURRENCY above.
	let processed = 0
	const pageTexts = await concurrencyLimit(
		VISION_OCR_CONCURRENCY,
		sortedPages,
		async (p): Promise<PageTextBlock> => {
			let block: PageTextBlock
			if (!p.jpegBuffer) {
				block = { order: p.order, empty: true }
			} else {
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
					block = { order: p.order, empty: true }
				} else {
					block = {
						order: p.order,
						empty: false,
						top: reconstructRegionText(result.tokens, "top"),
						body: reconstructRegionText(result.tokens, "body"),
					}
				}
			}

			processed++
			if (
				options.onVisionProgress &&
				processed % VISION_PROGRESS_STRIDE === 0
			) {
				options.onVisionProgress(processed, totalPages)
			}
			return block
		},
	)
	options.onVisionProgress?.(totalPages, totalPages)

	// A page is blank if upstream flagged it OR Cloud Vision returned no tokens.
	const blankIndices = pageTexts.filter((p) => p.empty).map((p) => p.order)

	// All pages blank → Vision couldn't read anything (dark photo, smudged
	// scan, blank doc). The LLM has no signal to segment on; calling it
	// would either produce one script that snapBlankStartPages drops to
	// zero, or N scripts the teacher has to manually correct anyway.
	// Return one placeholder script covering the whole doc — the teacher
	// drags-splits as needed in staging review.
	if (blankIndices.length === totalPages) {
		logger.info(TAG, "All pages blank — falling back to single script", {
			totalPages,
		})
		return {
			scripts: [{ startPage: 0, endPage: totalPages - 1, studentName: null }],
		}
	}

	const prompt = buildSegmentationPrompt({
		totalPages,
		blankIndices,
		pages: pageTexts,
	})

	// Lambda-aware timeout: when invoked from an SQS handler the caller
	// supplies `getRemainingTimeMs`, and we set the LLM wall-clock budget
	// to (remaining − 10s) clamped to a 90s floor. Gives us as much room
	// as the Lambda has, while still leaving headroom to capture a clean
	// failure status and DLQ-route before the runtime kills us mid-call.
	// Outside Lambda (tests, web server actions): undefined → runner default.
	const remainingMs = options.getRemainingTimeMs?.()
	const segmentationTimeoutMs =
		remainingMs !== undefined
			? Math.max(
					DEFAULT_LLM_TIMEOUT_MS,
					remainingMs - SEGMENTATION_LAMBDA_HEADROOM_MS,
				)
			: undefined

	type AttemptResult = {
		scripts: SegmentedScript[]
		llmElapsedMs: number
		inputTokens: number | undefined
		outputTokens: number | undefined
	}

	const attempt = async (): Promise<AttemptResult> => {
		const t0 = Date.now()
		let usage:
			| { inputTokens: number | undefined; outputTokens: number | undefined }
			| undefined
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
				usage = result.usage
				return result
			},
			segmentationTimeoutMs !== undefined
				? { timeoutMs: segmentationTimeoutMs }
				: undefined,
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
		return {
			scripts: snapBlankStartPages(raw, new Set(blankIndices), totalPages),
			llmElapsedMs: Date.now() - t0,
			inputTokens: usage?.inputTokens,
			outputTokens: usage?.outputTokens,
		}
	}

	let result = await attempt()
	let validation = validateScripts(result.scripts, totalPages)
	if (!validation.ok) {
		logger.warn(TAG, "Segmentation output failed validation — retrying once", {
			totalPages,
			reason: validation.error,
			scripts: result.scripts,
		})
		result = await attempt()
		validation = validateScripts(result.scripts, totalPages)
		if (!validation.ok) {
			// Don't fail the whole batch — fall back to one script covering all
			// pages. The teacher drags-splits in staging review. Throwing here
			// would mean a single bad LLM run wipes the entire upload, even
			// though the source PDFs / images themselves are fine.
			logger.warn(
				TAG,
				"Segmentation output invalid after retry — falling back to single script",
				{ totalPages, reason: validation.error },
			)
			return {
				scripts: [{ startPage: 0, endPage: totalPages - 1, studentName: null }],
			}
		}
	}

	options.onSegmentationMetrics?.({
		totalPages,
		blankCount: blankIndices.length,
		promptChars: prompt.length,
		scriptCount: result.scripts.length,
		inputTokens: result.inputTokens,
		outputTokens: result.outputTokens,
		llmElapsedMs: result.llmElapsedMs,
	})

	return { scripts: result.scripts }
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

// Pure structural transforms used above live in `segmentation-transforms.ts`
// (no LLM/SST/DB imports) so unit tests can exercise them without booting
// the SST runtime. Re-exported here so existing call sites keep working.
export {
	type RawSegmentedScript,
	type SegmentedScript,
	type ValidationResult,
	lengthsToRanges,
	snapBlankStartPages,
	validateScripts,
} from "./segmentation-transforms"
