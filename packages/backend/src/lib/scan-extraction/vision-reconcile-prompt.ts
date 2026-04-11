import { z } from "zod/v4"

export const ReconcileSchema = z.object({
	corrections: z
		.array(
			z.object({
				text_raw: z
					.string()
					.describe(
						"The original OCR text exactly as shown in the input list (used to match the correction to the right token)",
					),
				text_corrected: z
					.string()
					.describe("The correctly-read word from the image"),
			}),
		)
		.describe(
			"Only tokens that need correction — omit tokens that are already correct",
		),
})

export function buildReconciliationPrompt(tokenList: string): string {
	return `You are correcting OCR errors in a list of words extracted from a student's handwritten exam script.

The OCR engine detected the following words from this page:
${tokenList}

Look at the image and identify words the OCR engine misread.

Return a JSON object with a "corrections" array. Each entry should have:
- text_raw: the EXACT original OCR text from the list above (copy it precisely)
- text_corrected: what the word actually says in the image

Only include words that need correction. If the OCR reading is already correct, do NOT include it.
Do not correct punctuation, symbols, or formatting — only misread words.`
}
