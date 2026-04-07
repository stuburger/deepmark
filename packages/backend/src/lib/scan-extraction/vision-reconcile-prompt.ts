import { Type } from "@google/genai"

export const RECONCILE_SCHEMA = {
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

export function buildReconciliationPrompt(tokenList: string): string {
	return `You are correcting OCR errors in a list of words extracted from a student's handwritten exam script.

The OCR engine has detected the following words (indexed 0-based) from this page:
${tokenList}

For each token, provide the correctly-read word by looking at the image. If the OCR reading is already correct, return it unchanged. If the token is a punctuation mark, space, or non-word symbol, return it as-is.

Return one entry per token, preserving the original token_idx values.`
}
