import { GoogleGenAI, type Part } from "@google/genai"
import { Resource } from "sst"
import {
	buildBlankClassificationPrompt,
	buildNameExtractionPrompt,
	buildPageBoundaryPrompt,
} from "./classify-prompts"
import { extractJsonFromResponse } from "./llm-output"
import type { PageData } from "./types"

export async function callClassifyPageBoundary(
	prevPage: PageData | null,
	currentPage: PageData,
): Promise<{ isScriptStart: boolean | null; confidence: number }> {
	const ai = new GoogleGenAI({ apiKey: Resource.GeminiApiKey.value })

	const parts: Part[] = []

	if (prevPage?.jpegBuffer) {
		parts.push({
			inlineData: {
				mimeType: "image/jpeg",
				data: prevPage.jpegBuffer.toString("base64"),
			},
		})
	}

	if (currentPage.jpegBuffer) {
		parts.push({
			inlineData: {
				mimeType: "image/jpeg",
				data: currentPage.jpegBuffer.toString("base64"),
			},
		})
	}

	const contextDesc = prevPage?.jpegBuffer
		? "The FIRST image is the PREVIOUS page; the SECOND image is the CURRENT page."
		: "The image is the CURRENT page (no previous page context)."

	parts.push({ text: buildPageBoundaryPrompt(contextDesc) })

	try {
		const response = await ai.models.generateContent({
			model: "gemini-2.5-flash",
			contents: [{ role: "user", parts }],
		})

		const rawText = response.candidates?.[0]?.content?.parts?.[0]?.text ?? ""
		const jsonStr = extractJsonFromResponse(rawText)
		if (!jsonStr) return { isScriptStart: null, confidence: 0.5 }
		const parsed = JSON.parse(jsonStr) as {
			isScriptStart: boolean
			confidence: number
		}

		return {
			isScriptStart:
				typeof parsed.isScriptStart === "boolean" ? parsed.isScriptStart : null,
			confidence:
				typeof parsed.confidence === "number"
					? Math.min(1, Math.max(0, parsed.confidence))
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
	const ai = new GoogleGenAI({ apiKey: Resource.GeminiApiKey.value })

	const parts: Part[] = []

	if (prevPage?.jpegBuffer) {
		parts.push({
			inlineData: {
				mimeType: "image/jpeg",
				data: prevPage.jpegBuffer.toString("base64"),
			},
		})
	}
	if (nextPage?.jpegBuffer) {
		parts.push({
			inlineData: {
				mimeType: "image/jpeg",
				data: nextPage.jpegBuffer.toString("base64"),
			},
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

	parts.push({ text: buildBlankClassificationPrompt(contextDesc) })

	try {
		const response = await ai.models.generateContent({
			model: "gemini-2.5-flash",
			contents: [{ role: "user", parts }],
		})

		const rawText = response.candidates?.[0]?.content?.parts?.[0]?.text ?? ""
		const jsonStr = extractJsonFromResponse(rawText)
		if (!jsonStr) return "artifact"
		const parsed = JSON.parse(jsonStr) as { classification: string }
		const c = parsed.classification

		if (c === "separator" || c === "script_page" || c === "artifact") {
			return c
		}
		return "artifact"
	} catch {
		return "artifact"
	}
}

export async function callExtractNameFromPage(
	jpegBuffer: Buffer,
): Promise<{ name: string | null; confidence: number }> {
	const ai = new GoogleGenAI({ apiKey: Resource.GeminiApiKey.value })

	try {
		const response = await ai.models.generateContent({
			model: "gemini-2.5-flash",
			contents: [
				{
					role: "user",
					parts: [
						{
							inlineData: {
								mimeType: "image/jpeg",
								data: jpegBuffer.toString("base64"),
							},
						},
						{ text: buildNameExtractionPrompt() },
					],
				},
			],
		})

		const rawText = response.candidates?.[0]?.content?.parts?.[0]?.text ?? ""
		const jsonStr = extractJsonFromResponse(rawText)
		if (!jsonStr) return { name: null, confidence: 0.0 }
		const parsed = JSON.parse(jsonStr) as {
			name: string | null
			confidence: number
		}

		return {
			name:
				typeof parsed.name === "string" && parsed.name.trim()
					? parsed.name.trim()
					: null,
			confidence:
				typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
		}
	} catch {
		return { name: null, confidence: 0.0 }
	}
}
