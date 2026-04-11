import { db } from "@/db"
import { callLlmWithFallback } from "@/lib/infra/llm-runtime"
import { logger } from "@/lib/infra/logger"
import { getFileBase64 } from "@/lib/infra/s3"
import { logOcrRunEvent } from "@mcp-gcse/db"
import type { LlmRunner } from "@mcp-gcse/shared"
import { generateText } from "ai"
import { outputSchema } from "@/lib/infra/output-schema"
import { Resource } from "sst"
import {
	ReconcileSchema,
	buildReconciliationPrompt,
} from "./vision-reconcile-prompt"

const TAG = "vision-reconcile"

export type ReconcilePageEntry = {
	key: string
	order: number
	mime_type: string
}

/** Token row as returned from the DB insert (or equivalent in-memory record). */
export type PageToken = {
	id: string
	page_order: number
	para_index: number
	line_index: number
	word_index: number
	text_raw: string
	bbox: unknown
}

/** Token row with OCR corrections applied — output of reconcilePageTokens. */
export type CorrectedPageToken = PageToken & {
	text_corrected: string | null
}

/**
 * Corrects Cloud Vision OCR token text against the original page images using the LLM.
 *
 * Accepts the pre-loaded token rows (returned from the DB insert in the extract
 * pipeline), so no DB read is required. The explicit token input makes the
 * reconcile → attribution dependency visible in the call chain rather than
 * hidden behind a shared DB table.
 *
 * Still writes `text_corrected` back to each `StudentPaperPageToken` row so the
 * corrected text is available to any future readers (e.g. the annotation engine).
 * Returns the same tokens with `text_corrected` populated — null for any token
 * on a page that failed or was skipped.
 */
export async function reconcilePageTokens({
	pages,
	tokens,
	jobId,
	llm,
}: {
	pages: ReconcilePageEntry[]
	/** Pre-loaded token rows from the DB insert — avoids a redundant re-read. */
	tokens: PageToken[]
	jobId: string
	llm?: LlmRunner
}): Promise<CorrectedPageToken[]> {
	if (pages.length === 0 || tokens.length === 0) {
		return tokens.map((t) => ({ ...t, text_corrected: null }))
	}

	const imagePages = pages.filter((p) => p.mime_type !== "application/pdf")
	if (imagePages.length === 0) {
		return tokens.map((t) => ({ ...t, text_corrected: null }))
	}

	// Group tokens by page, sorted into reading order.
	const tokensByPage = new Map<number, PageToken[]>()
	for (const t of tokens) {
		const existing = tokensByPage.get(t.page_order) ?? []
		existing.push(t)
		tokensByPage.set(t.page_order, existing)
	}
	for (const [pageOrder, pageTokens] of tokensByPage) {
		tokensByPage.set(
			pageOrder,
			pageTokens.sort((a, b) =>
				a.para_index !== b.para_index
					? a.para_index - b.para_index
					: a.line_index !== b.line_index
						? a.line_index - b.line_index
						: a.word_index - b.word_index,
			),
		)
	}

	// Collect corrections keyed by token id.
	const correctionById = new Map<string, string>()
	let totalCorrected = 0

	await Promise.all(
		imagePages.map(async (page): Promise<void> => {
			const pageTokens = tokensByPage.get(page.order) ?? []
			if (pageTokens.length === 0) return

			try {
				let imageBase64: string
				try {
					imageBase64 = await getFileBase64(Resource.ScansBucket.name, page.key)
				} catch (err) {
					logger.error(TAG, "Failed to fetch page image for reconciliation", {
						jobId,
						pageOrder: page.order,
						error: String(err),
					})
					return
				}

				const tokenList = pageTokens.map((t) => `"${t.text_raw}"`).join(", ")

				const { output } = await callLlmWithFallback(
						"vision-token-reconciliation",
						async (model, entry, report) => {
							const result = await generateText({
								model,
								temperature: entry.temperature,
								messages: [
									{
										role: "user",
										content: [
											{
												type: "image",
												image: imageBase64,
												mediaType: page.mime_type,
											},
											{
												type: "text",
												text: buildReconciliationPrompt(tokenList),
											},
										],
									},
								],
								output: outputSchema(ReconcileSchema),
							})
							report.usage = result.usage
							return result
						},
						llm,
					)
				const corrections = output.corrections

				// Build a queue of tokens grouped by raw text for order-of-appearance matching.
				const tokenQueue = new Map<string, PageToken[]>()
				for (const t of pageTokens) {
					const list = tokenQueue.get(t.text_raw) ?? []
					list.push(t)
					tokenQueue.set(t.text_raw, list)
				}

				// Match corrections to tokens by raw text, consuming in reading order.
				const pageCorrections: Array<{ tokenId: string; text: string }> = []
				let skipped = 0
				for (const c of corrections) {
					if (c.text_raw === c.text_corrected) continue

					const candidates = tokenQueue.get(c.text_raw)
					const token = candidates?.shift()
					if (!token) {
						skipped++
						continue
					}

					correctionById.set(token.id, c.text_corrected)
					pageCorrections.push({ tokenId: token.id, text: c.text_corrected })
				}

				// Write corrections to DB in parallel.
				await Promise.all(
					pageCorrections.map(async ({ tokenId, text }) => {
						await db.studentPaperPageToken.update({
							where: { id: tokenId },
							data: { text_corrected: text },
						})
					}),
				)

				totalCorrected += pageCorrections.length

				logger.info(TAG, "Token reconciliation complete for page", {
					jobId,
					pageOrder: page.order,
					tokens_corrected: pageCorrections.length,
					tokens_skipped: skipped,
				})
			} catch (err) {
				logger.error(TAG, "Token reconciliation failed for page", {
					jobId,
					pageOrder: page.order,
					error: String(err),
				})
			}
		}),
	)

	void logOcrRunEvent(db, jobId, {
		type: "token_reconciliation_complete",
		at: new Date().toISOString(),
		tokens_corrected: totalCorrected,
	})

	// Merge corrections back onto the input tokens and return.
	return tokens.map((t) => ({
		...t,
		text_corrected: correctionById.get(t.id) ?? null,
	}))
}
