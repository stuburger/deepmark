import { db } from "@/db"
import { callLlmWithFallback } from "@/lib/infra/llm-runtime"
import { logger } from "@/lib/infra/logger"
import { outputSchema } from "@/lib/infra/output-schema"
import { getFileBase64 } from "@/lib/infra/s3"
import type { LlmRunner } from "@mcp-gcse/shared"
import { generateText } from "ai"
import { Resource } from "sst"
import { z } from "zod/v4"
import type { CorrectedPageToken } from "./vision-reconcile"

const TAG = "token-answer-align"

/** Set to true to use LLM-powered mapping. False = Levenshtein fallback. */
const USE_LLM_MAPPING = false

// ─── LLM Schema + Prompt ────────────────────────────────────────────────────

const MappingSchema = z.object({
	mappings: z
		.array(
			z.object({
				token_index: z
					.number()
					.describe("0-based index into the token list"),
				answer_word_index: z
					.number()
					.describe(
						"0-based index into the answer words list. -1 if this token does not map to any answer word (junk/misattributed)",
					),
				text_corrected: z
					.string()
					.describe(
						"The correctly-read word from the image. Same as the original if already correct",
					),
			}),
		)
		.describe("One entry per token — every token must appear exactly once"),
})

function buildMappingPrompt(
	tokenList: string,
	answerWords: string,
	questionNumber: string,
): string {
	return `You are mapping OCR word tokens from a student's handwritten exam script to the corresponding words in a transcribed answer.

## Question ${questionNumber}

**OCR tokens** (in reading order from the page — showing raw OCR text and any prior correction):
${tokenList}

**Answer words** (the correct transcription of this answer):
${answerWords}

## Task

For each OCR token, determine which answer word it corresponds to. Return a JSON object with a "mappings" array containing one entry per token:

- token_index: the 0-based position in the OCR tokens list
- answer_word_index: the 0-based position in the answer words list, or -1 if this token is junk (from a different question, duplicated by OCR, or doesn't map to any answer word)
- text_corrected: what the word actually says (correct any OCR misreads by looking at the image)

Rules:
- Every token must appear exactly once in the output
- Multiple tokens can map to the same answer word (if OCR split one word into pieces)
- Tokens that are clearly from a different answer or are OCR artifacts should get answer_word_index: -1
- Preserve the answer word ordering — mappings should generally increase in answer_word_index
- Look at the handwriting in the image to verify your corrections`
}

// ─── Levenshtein fallback ───────────────────────────────────────────────────

function normalizedDistance(a: string, b: string): number {
	if (a === b) return 0
	const la = a.length
	const lb = b.length
	if (la === 0) return 1
	if (lb === 0) return 1

	const matrix: number[][] = Array.from({ length: la + 1 }, (_, i) => {
		const row = new Array<number>(lb + 1)
		row[0] = i
		return row
	})
	for (let j = 0; j <= lb; j++) matrix[0][j] = j

	for (let i = 1; i <= la; i++) {
		for (let j = 1; j <= lb; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1
			matrix[i][j] = Math.min(
				matrix[i - 1][j] + 1,
				matrix[i][j - 1] + 1,
				matrix[i - 1][j - 1] + cost,
			)
		}
	}
	return matrix[la][lb] / Math.max(la, lb)
}

const MAX_DISTANCE = 0.4
const LOOK_AHEAD = 8

function levenshteinAlign(
	answerWords: WordWithOffset[],
	tokens: CorrectedPageToken[],
): Array<{ tokenId: string; charStart: number; charEnd: number }> {
	const result = new Map<
		string,
		{ tokenId: string; charStart: number; charEnd: number }
	>()
	const assignedWordIndices = new Set<number>()
	let wordCursor = 0

	// Pass 1: fuzzy match
	for (const token of tokens) {
		if (wordCursor >= answerWords.length) break
		const tokenText = (token.text_corrected ?? token.text_raw).toLowerCase()
		if (tokenText.length === 0) continue

		let bestIdx = -1
		let bestDist = Number.POSITIVE_INFINITY
		const searchEnd = Math.min(wordCursor + LOOK_AHEAD, answerWords.length)
		for (let i = wordCursor; i < searchEnd; i++) {
			if (assignedWordIndices.has(i)) continue
			const dist = normalizedDistance(
				tokenText,
				answerWords[i].word.toLowerCase(),
			)
			if (dist < bestDist) {
				bestDist = dist
				bestIdx = i
			}
		}

		if (bestIdx >= 0 && bestDist <= MAX_DISTANCE) {
			const aw = answerWords[bestIdx]
			result.set(token.id, {
				tokenId: token.id,
				charStart: aw.start,
				charEnd: aw.end,
			})
			assignedWordIndices.add(bestIdx)
			wordCursor = bestIdx + 1
		}
	}

	// Pass 2: positional fill
	const unmatchedTokens = tokens.filter((t) => !result.has(t.id))
	const freeWords: number[] = []
	for (let i = 0; i < answerWords.length; i++) {
		if (!assignedWordIndices.has(i)) freeWords.push(i)
	}
	const limit = Math.min(unmatchedTokens.length, freeWords.length)
	for (let i = 0; i < limit; i++) {
		const token = unmatchedTokens[i]
		const aw = answerWords[freeWords[i]]
		result.set(token.id, {
			tokenId: token.id,
			charStart: aw.start,
			charEnd: aw.end,
		})
	}

	return Array.from(result.values())
}

// ─── Shared types ───────────────────────────────────────────────────────────

type WordWithOffset = { word: string; start: number; end: number }

function splitWithOffsets(text: string): WordWithOffset[] {
	const words: WordWithOffset[] = []
	const regex = /\S+/g
	let match: RegExpExecArray | null = null
	for (match = regex.exec(text); match !== null; match = regex.exec(text)) {
		words.push({
			word: match[0],
			start: match.index,
			end: match.index + match[0].length,
		})
	}
	return words
}

type PageEntry = {
	key: string
	order: number
	mime_type: string
}

// ─── Main function ──────────────────────────────────────────────────────────

/**
 * Maps OCR tokens to answer word character offsets and persists them.
 *
 * When `USE_LLM_MAPPING` is true, sends each question's tokens + answer +
 * page image to the LLM for intelligent mapping.
 *
 * When false, uses a two-pass Levenshtein + positional fill algorithm.
 */
export async function alignAndPersistTokenOffsets({
	extractedAnswers,
	pages,
	jobId,
	llm,
}: {
	extractedAnswers: Array<{ question_id: string; answer_text: string }>
	pages: PageEntry[]
	jobId: string
	llm?: LlmRunner
}): Promise<void> {
	const answerByQuestion = new Map(
		extractedAnswers.map((a) => [a.question_id, a.answer_text]),
	)

	// Read tokens with question_id from DB (attribution has already written them)
	const dbTokens = await db.studentPaperPageToken.findMany({
		where: { submission_id: jobId, question_id: { not: null } },
		orderBy: [
			{ page_order: "asc" },
			{ para_index: "asc" },
			{ line_index: "asc" },
			{ word_index: "asc" },
		],
		select: {
			id: true,
			question_id: true,
			text_raw: true,
			text_corrected: true,
			page_order: true,
			para_index: true,
			line_index: true,
			word_index: true,
		},
	})

	// Group tokens by question + page
	type TokenRow = (typeof dbTokens)[number]
	const grouped = new Map<string, Map<number, TokenRow[]>>()
	for (const t of dbTokens) {
		if (!t.question_id) continue
		let byPage = grouped.get(t.question_id)
		if (!byPage) {
			byPage = new Map()
			grouped.set(t.question_id, byPage)
		}
		const list = byPage.get(t.page_order) ?? []
		list.push(t)
		byPage.set(t.page_order, list)
	}

	// Look up question numbers for logging/prompts
	const questions = await db.question.findMany({
		where: { id: { in: [...grouped.keys()] } },
		select: { id: true, question_number: true },
	})
	const questionNumberById = new Map(
		questions.map((q) => [q.id, q.question_number]),
	)

	// Page image lookup
	const imagePages = pages.filter((p) => p.mime_type !== "application/pdf")
	const pageByOrder = new Map(imagePages.map((p) => [p.order, p]))

	const updates: Array<{
		id: string
		charStart: number | null
		charEnd: number | null
		textCorrected: string | null
	}> = []

	for (const [questionId, byPage] of grouped) {
		const answerText = answerByQuestion.get(questionId)
		if (!answerText) continue

		const answerWords = splitWithOffsets(answerText)
		if (answerWords.length === 0) continue

		const questionNumber = questionNumberById.get(questionId) ?? "?"

		// Collect all tokens for this question across pages
		const allTokens: TokenRow[] = []
		for (const [, pageTokens] of [...byPage.entries()].sort(
			([a], [b]) => a - b,
		)) {
			allTokens.push(...pageTokens)
		}
		if (allTokens.length === 0) continue

		if (USE_LLM_MAPPING) {
			// ── LLM mapping ─────────────────────────────────────────────
			const primaryPageOrder = findPrimaryPage(byPage)
			const page = pageByOrder.get(primaryPageOrder)
			if (!page) continue

			try {
				const imageBase64 = await getFileBase64(
					Resource.ScansBucket.name,
					page.key,
				)

				const tokenList = allTokens
					.map((t, i) => {
						const raw = t.text_raw
						const corrected = t.text_corrected
						return corrected && corrected !== raw
							? `[${i}] raw: "${raw}" → corrected: "${corrected}"`
							: `[${i}] "${raw}"`
					})
					.join("\n")

				const answerWordList = answerWords
					.map((w, i) => `[${i}] "${w.word}"`)
					.join("\n")

				const { output } = await callLlmWithFallback(
					"token-answer-mapping",
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
											text: buildMappingPrompt(
												tokenList,
												answerWordList,
												questionNumber,
											),
										},
									],
								},
							],
							output: outputSchema(MappingSchema),
						})
						report.usage = result.usage
						return result
					},
					llm,
				)

				for (const m of output.mappings) {
					if (m.token_index < 0 || m.token_index >= allTokens.length) continue
					const token = allTokens[m.token_index]
					const answerWord =
						m.answer_word_index >= 0 &&
						m.answer_word_index < answerWords.length
							? answerWords[m.answer_word_index]
							: null

					updates.push({
						id: token.id,
						charStart: answerWord?.start ?? null,
						charEnd: answerWord?.end ?? null,
						textCorrected:
							m.text_corrected !== token.text_raw
								? m.text_corrected
								: token.text_corrected,
					})
				}

				logger.info(TAG, "LLM token mapping complete", {
					jobId,
					questionNumber,
					tokens: allTokens.length,
					mapped: output.mappings.filter((m) => m.answer_word_index >= 0)
						.length,
				})
			} catch (err) {
				logger.error(TAG, "LLM token mapping failed — falling back to Levenshtein", {
					jobId,
					questionNumber,
					error: String(err),
				})
				// Fall through to Levenshtein
				const offsets = levenshteinAlign(
					answerWords,
					allTokens.map((t) => ({
						id: t.id,
						page_order: t.page_order,
						para_index: t.para_index,
						line_index: t.line_index,
						word_index: t.word_index,
						text_raw: t.text_raw,
						text_corrected: t.text_corrected,
						bbox: {},
					})),
				)
				for (const o of offsets) {
					updates.push({
						id: o.tokenId,
						charStart: o.charStart,
						charEnd: o.charEnd,
						textCorrected: null,
					})
				}
			}
		} else {
			// ── Levenshtein fallback ─────────────────────────────────────
			const offsets = levenshteinAlign(
				answerWords,
				allTokens.map((t) => ({
					id: t.id,
					page_order: t.page_order,
					para_index: t.para_index,
					line_index: t.line_index,
					word_index: t.word_index,
					text_raw: t.text_raw,
					text_corrected: t.text_corrected,
					bbox: {},
				})),
			)
			for (const o of offsets) {
				updates.push({
					id: o.tokenId,
					charStart: o.charStart,
					charEnd: o.charEnd,
					textCorrected: null,
				})
			}
		}
	}

	// Batch write
	const CHUNK_SIZE = 50
	for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
		const chunk = updates.slice(i, i + CHUNK_SIZE)
		await Promise.all(
			chunk.map((u) =>
				db.studentPaperPageToken.update({
					where: { id: u.id },
					data: {
						answer_char_start: u.charStart,
						answer_char_end: u.charEnd,
						...(u.textCorrected != null
							? { text_corrected: u.textCorrected }
							: {}),
					},
				}),
			),
		)
	}

	logger.info(TAG, `Token alignment persisted (${USE_LLM_MAPPING ? "LLM" : "Levenshtein"})`, {
		jobId,
		tokens_mapped: updates.filter((u) => u.charStart != null).length,
		tokens_total: dbTokens.length,
		questions: grouped.size,
	})
}

/** Find the page with the most tokens for a question. */
function findPrimaryPage(byPage: Map<number, unknown[]>): number {
	let best = 0
	let bestCount = 0
	for (const [pageOrder, tokens] of byPage) {
		if (tokens.length > bestCount) {
			bestCount = tokens.length
			best = pageOrder
		}
	}
	return best
}
