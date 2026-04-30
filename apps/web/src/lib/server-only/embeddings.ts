// Server-only helper. NOT a "use server" module — embedText cannot be exposed
// as an RPC, otherwise any logged-in client could spam Gemini and burn credits.
// Callers are server-side only: action handlers and server-only services.

import { GoogleGenAI } from "@google/genai"
import { Resource } from "sst"

const EMBEDDING_DIMENSIONS = 1536

/**
 * Generates a semantic embedding vector for the given text using Gemini.
 * Returns the vector or null if the call fails or returns unexpected
 * dimensions.
 */
export async function embedText(text: string): Promise<number[] | null> {
	const gemini = new GoogleGenAI({ apiKey: Resource.GeminiApiKey.value })
	const result = await gemini.models.embedContent({
		model: "gemini-embedding-001",
		contents: text,
		config: {
			outputDimensionality: EMBEDDING_DIMENSIONS,
			taskType: "SEMANTIC_SIMILARITY",
		},
	})
	const values = result.embeddings?.[0]?.values
	if (!values || values.length !== EMBEDDING_DIMENSIONS) return null
	return Array.from(values)
}
