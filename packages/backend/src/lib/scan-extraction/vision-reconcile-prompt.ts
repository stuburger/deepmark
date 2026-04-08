import { Type } from "@google/genai"

export const RECONCILE_SCHEMA = {
	type: Type.ARRAY,
	description:
		"Only tokens that need correction — omit tokens that are already correct",
	items: {
		type: Type.OBJECT,
		properties: {
			text_raw: {
				type: Type.STRING,
				description:
					"The original OCR text exactly as shown in the input list (used to match the correction to the right token)",
			},
			text_corrected: {
				type: Type.STRING,
				description: "The correctly-read word from the image",
			},
		},
		required: ["text_raw", "text_corrected"],
	},
}

export function buildReconciliationPrompt(tokenList: string): string {
	return `You are correcting OCR errors in a list of words extracted from a student's handwritten exam script.

The OCR engine detected the following words from this page:
${tokenList}

Look at the image and identify words the OCR engine misread. For each misread word, return:
- text_raw: the EXACT original OCR text from the list above (copy it precisely)
- text_corrected: what the word actually says in the image

Only return words that need correction. If the OCR reading is already correct, do NOT include it.
Do not correct punctuation, symbols, or formatting — only misread words.`
}
