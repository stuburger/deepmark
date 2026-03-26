import { db } from "@/db"
import { logger } from "@/lib/logger"
import { getFileBase64 } from "@/lib/s3"
import { GoogleGenAI, Type } from "@google/genai"
import { logStudentPaperEvent } from "@mcp-gcse/db"
import { Resource } from "sst"

const TAG = "vision-reconcile"

export type ReconcilePageEntry = {
	key: string
	order: number
	mime_type: string
}

const RECONCILE_SCHEMA = {
	type: Type.ARRAY,
	description:
		"Corrected text for each Vision token, in the same order as the input tokens",
	items: {
		type: Type.OBJECT,
		properties: {
			token_idx: {
				type: Type.INTEGER,
				description: "Zero-based index of the token in the input list",
			},
			text_corrected: {
				type: Type.STRING,
				description:
					"The correctly-read word (may be same as text_raw if correct)",
			},
		},
		required: ["token_idx", "text_corrected"],
	},
}

type TokenRow = {
	id: string
	text_raw: string
}

/**
 * Fire-and-forget reconciliation: for each page, loads the Cloud Vision word
 * tokens stored in Neon, sends the page image + Gemini transcript + token list
 * to Gemini, and asks it to correct the raw Vision text for each token.
 *
 * Writes `text_corrected` back onto each `StudentPaperPageToken` row.
 * Failures per page are logged and skipped — grading is never blocked by this.
 */
export async function reconcilePageTokens({
	pages,
	jobId,
}: {
	pages: ReconcilePageEntry[]
	jobId: string
}): Promise<void> {
	if (pages.length === 0) return

	const imagePages = pages.filter((p) => p.mime_type !== "application/pdf")
	if (imagePages.length === 0) return

	const gemini = new GoogleGenAI({ apiKey: Resource.GeminiApiKey.value })

	let totalCorrected = 0

	await Promise.all(
		imagePages.map(async (page): Promise<void> => {
			try {
				// Load tokens for this page
				const tokens = await db.studentPaperPageToken.findMany({
					where: { job_id: jobId, page_order: page.order },
					orderBy: [
						{ para_index: "asc" },
						{ line_index: "asc" },
						{ word_index: "asc" },
					],
					select: { id: true, text_raw: true },
				})

				if (tokens.length === 0) return

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

				const mimeType = page.mime_type as string
				const tokenList = tokens
					.map((t: TokenRow, i: number) => `${i}: "${t.text_raw}"`)
					.join("\n")

				const response = await gemini.models.generateContent({
					model: "gemini-2.5-flash",
					contents: [
						{
							role: "user",
							parts: [
								{ inlineData: { data: imageBase64, mimeType } },
								{
									text: `You are correcting OCR errors in a list of words extracted from a student's handwritten exam script.

The OCR engine has detected the following words (indexed 0-based) from this page:
${tokenList}

For each token, provide the correctly-read word by looking at the image. If the OCR reading is already correct, return it unchanged. If the token is a punctuation mark, space, or non-word symbol, return it as-is.

Return one entry per token, preserving the original token_idx values.`,
								},
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
				if (!responseText) return

				const corrections = JSON.parse(responseText) as Array<{
					token_idx: number
					text_corrected: string
				}>

				// Write corrections back to the token rows
				await Promise.all(
					corrections.map(async (c) => {
						const token = tokens[c.token_idx]
						if (!token) return
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
}
