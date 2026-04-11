import { callLlmWithFallback } from "@/lib/infra/llm-runtime"
import { generateText } from "ai"
import { outputSchema } from "@/lib/infra/output-schema"
import { z } from "zod/v4"
import {
	buildBlankClassificationPrompt,
	buildNameExtractionPrompt,
	buildPageBoundaryPrompt,
} from "./classify-prompts"
import type { PageData } from "./types"

const PageBoundarySchema = z.object({
	isScriptStart: z.boolean(),
	confidence: z.number(),
})

const BlankClassificationSchema = z.object({
	classification: z.enum(["separator", "script_page", "artifact"]),
})

const NameExtractionSchema = z.object({
	name: z.string().nullable(),
	confidence: z.number(),
})

export async function callClassifyPageBoundary(
	prevPage: PageData | null,
	currentPage: PageData,
): Promise<{ isScriptStart: boolean | null; confidence: number }> {
	const content: Array<
		| { type: "image"; image: string; mediaType: string }
		| { type: "text"; text: string }
	> = []

	if (prevPage?.jpegBuffer) {
		content.push({
			type: "image",
			image: prevPage.jpegBuffer.toString("base64"),
			mediaType: "image/jpeg",
		})
	}

	if (currentPage.jpegBuffer) {
		content.push({
			type: "image",
			image: currentPage.jpegBuffer.toString("base64"),
			mediaType: "image/jpeg",
		})
	}

	const contextDesc = prevPage?.jpegBuffer
		? "The FIRST image is the PREVIOUS page; the SECOND image is the CURRENT page."
		: "The image is the CURRENT page (no previous page context)."

	content.push({ type: "text", text: buildPageBoundaryPrompt(contextDesc) })

	try {
		const { output } = await callLlmWithFallback(
			"script-boundary-classification",
			async (model, entry, report) => {
				const result = await generateText({
					model,
					temperature: entry.temperature,
					messages: [{ role: "user", content }],
					output: outputSchema(PageBoundarySchema),
				})
				report.usage = result.usage
				return result
			},
		)

		return {
			isScriptStart:
				typeof output.isScriptStart === "boolean" ? output.isScriptStart : null,
			confidence:
				typeof output.confidence === "number"
					? Math.min(1, Math.max(0, output.confidence))
					: 0.5,
		}
	} catch {
		return { isScriptStart: null, confidence: 0.0 }
	}
}

export async function callClassifyBlankPage(
	prevPage: PageData | null,
	nextPage: PageData | null,
): Promise<"separator" | "script_page" | "artifact"> {
	const content: Array<
		| { type: "image"; image: string; mediaType: string }
		| { type: "text"; text: string }
	> = []

	if (prevPage?.jpegBuffer) {
		content.push({
			type: "image",
			image: prevPage.jpegBuffer.toString("base64"),
			mediaType: "image/jpeg",
		})
	}
	if (nextPage?.jpegBuffer) {
		content.push({
			type: "image",
			image: nextPage.jpegBuffer.toString("base64"),
			mediaType: "image/jpeg",
		})
	}

	const contextDesc =
		prevPage?.jpegBuffer && nextPage?.jpegBuffer
			? "The first image is the page BEFORE the blank; the second image is the page AFTER."
			: prevPage?.jpegBuffer
				? "The image is the page BEFORE the blank (nothing follows)."
				: nextPage?.jpegBuffer
					? "The image is the page AFTER the blank (nothing precedes)."
					: "No surrounding pages available."

	content.push({
		type: "text",
		text: buildBlankClassificationPrompt(contextDesc),
	})

	try {
		const { output } = await callLlmWithFallback(
			"blank-page-classification",
			async (model, entry, report) => {
				const result = await generateText({
					model,
					temperature: entry.temperature,
					messages: [{ role: "user", content }],
					output: outputSchema(BlankClassificationSchema),
				})
				report.usage = result.usage
				return result
			},
		)

		return output.classification
	} catch {
		return "artifact"
	}
}

export async function callExtractNameFromPage(
	jpegBuffer: Buffer,
): Promise<{ name: string | null; confidence: number }> {
	try {
		const { output } = await callLlmWithFallback(
			"student-name-extraction",
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
									image: jpegBuffer.toString("base64"),
									mediaType: "image/jpeg",
								},
								{ type: "text", text: buildNameExtractionPrompt() },
							],
						},
					],
					output: outputSchema(NameExtractionSchema),
				})
				report.usage = result.usage
				return result
			},
		)

		return {
			name:
				typeof output.name === "string" && output.name.trim()
					? output.name.trim()
					: null,
			confidence:
				typeof output.confidence === "number" ? output.confidence : 0.5,
		}
	} catch {
		return { name: null, confidence: 0.0 }
	}
}
