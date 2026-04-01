import { GoogleGenAI, type Part } from "@google/genai"
import { Resource } from "sst"
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

	parts.push({
		text: `You are analysing scanned student exam scripts.
${contextDesc}
Determine whether the CURRENT page is the FIRST page of a NEW student's exam script.
Structural cues for a new script start: different student name or header at the top, question numbers resetting to the first question, a new paper title or section header, visibly different handwriting style.
Return ONLY valid JSON with no markdown or explanation:
{"isScriptStart":true,"confidence":0.95}`,
	})

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

	parts.push({
		text: `You are analysing scanned student exam scripts. A blank/near-blank page has been detected.
${contextDesc}
Classify the blank page as exactly one of:
- "separator": a deliberate blank page inserted between two different student scripts
- "script_page": a blank answer page belonging to a student (e.g. a page they left unanswered)
- "artifact": scanner noise, accidental blank, or cover page
Return ONLY valid JSON with no markdown:
{"classification":"separator"}`,
	})

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
						{
							text: 'Extract the student name from this exam script page if legible. Return ONLY valid JSON with no markdown: {"name":"<name>","confidence":0.95} — use null for name if not readable.',
						},
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
