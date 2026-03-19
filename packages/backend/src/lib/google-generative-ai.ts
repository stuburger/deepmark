import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { embed } from "ai"
import { Resource } from "sst"

/**
 * Default Gemini 3 chat model for all AI SDK chat usage (grading, tools, adversarial loop).
 * Change this one constant to retarget every call site using `defaultChatModel()`.
 */
export const DEFAULT_GEMINI_CHAT_MODEL = "gemini-3-pro-preview" as const

const QUESTION_EMBEDDING_DIMENSIONS = 1536

const gemini = createGoogleGenerativeAI({
	apiKey: Resource.GeminiApiKey.value,
})

export function defaultChatModel() {
	return gemini(DEFAULT_GEMINI_CHAT_MODEL)
}

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
