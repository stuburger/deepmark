import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { embed } from "ai"
import { Resource } from "sst"

const QUESTION_EMBEDDING_DIMENSIONS = 1536

const gemini = createGoogleGenerativeAI({
	apiKey: Resource.GeminiApiKey.value,
})

/**
 * Embedding for question deduplication / linking. Matches `vector(1536)` in Prisma.
 */
export async function embedQuestionText(text: string): Promise<number[]> {
	const { embedding } = await embed({
		model: gemini.embedding("gemini-embedding-001"),
		value: text,
		providerOptions: {
			google: {
				outputDimensionality: QUESTION_EMBEDDING_DIMENSIONS,
				taskType: "SEMANTIC_SIMILARITY",
			},
		},
	})
	if (embedding.length !== QUESTION_EMBEDDING_DIMENSIONS) {
		throw new Error(
			`Expected ${QUESTION_EMBEDDING_DIMENSIONS}-dim embedding, got ${embedding.length}`,
		)
	}
	return Array.from(embedding)
}
