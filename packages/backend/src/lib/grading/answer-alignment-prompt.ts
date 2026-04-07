import { z } from "zod"

export const AlignmentSchema = z.object({
	alignments: z.array(
		z.object({
			question_id: z.string(),
			answer_text: z.string(),
		}),
	),
})

export function buildAlignmentPrompt(
	questionsText: string,
	answersText: string,
): string {
	return `You are aligning a student's OCR-extracted answers to the correct exam questions.
The OCR may have misread question numbers (e.g. "0.1.2" instead of "01.2", "0.01" instead of "01.1").
Scan pages may have been photographed or uploaded out of order — do not assume the list order of OCR answers matches exam question order.

EXAM QUESTIONS THAT NEED ANSWERS (currently unmatched):
${questionsText}

ALL OCR-EXTRACTED ANSWERS (including already-matched ones for context):
${answersText}

For each unmatched exam question, identify the most likely student answer from the OCR outputs.
Consider: question number similarity, answer content matching question type (A/B/C/D for MCQ, text for written).
If a question genuinely has no student answer, use an empty string "".
Return the alignments array strictly matching the schema.`
}
