import { db } from "@/db"
import { logger } from "@/lib/infra/logger"
import { getFileBase64 } from "@/lib/infra/s3"
import { GoogleGenAI } from "@google/genai"
import { logStudentPaperEvent } from "@mcp-gcse/db"
import { Resource } from "sst"
import { RECONCILE_SCHEMA, buildReconciliationPrompt } from "./vision-reconcile-prompt"

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
 * Corrects Cloud Vision OCR token text against the original page images using Gemini.
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
}: {
	pages: ReconcilePageEntry[]
	/** Pre-loaded token rows from the DB insert — avoids a redundant re-read. */
	tokens: PageToken[]
	jobId: string
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

	const gemini = new GoogleGenAI({ apiKey: Resource.GeminiApiKey.value })

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

				const tokenList = pageTokens
					.map((t, i) => `${i}: "${t.text_raw}"`)
					.join("\n")

				const response = await gemini.models.generateContent({
					model: "gemini-2.5-flash",
					contents: [
						{
							role: "user",
							parts: [
								{ inlineData: { data: imageBase64, mimeType: page.mime_type } },
								{ text: buildReconciliationPrompt(tokenList) },
							],
						},
					],
					config: {
						responseMimeType: "application/json",
						responseSchema: RECONCILE_SCHEMA,
						temperature: 0.1,
					},
				})

				const responseText = response.candidates?.[0]?.content?.parts?.[0]?.text
				if (!responseText) {
					logger.error(TAG, "Gemini reconciliation returned no text", {
						jobId,
						pageOrder: page.order,
					})
					return
				}

				const corrections = JSON.parse(responseText) as Array<{
					token_idx: number
					text_corrected: string
				}>

				// Write corrections to DB and collect into the in-memory map.
				await Promise.all(
					corrections.map(async (c) => {
						const token = pageTokens[c.token_idx]
						if (!token) return
						correctionById.set(token.id, c.text_corrected)
						await db.studentPaperPageToken.update({
							where: { id: token.id },
							data: { text_corrected: c.text_corrected },
						})
					}),
				)

				totalCorrected += corrections.length

				logger.info(TAG, "Token reconciliation complete for page", {
					jobId,
					pageOrder: page.order,
					tokens_corrected: corrections.length,
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

	void logStudentPaperEvent(db, jobId, {
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
