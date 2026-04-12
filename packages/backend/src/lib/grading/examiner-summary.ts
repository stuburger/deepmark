import { logger } from "@/lib/infra/logger"
import { outputSchema } from "@/lib/infra/output-schema"
import type { LlmRunner } from "@mcp-gcse/shared"
import { generateText } from "ai"
import { z } from "zod/v4"
import type { GradingResult } from "./grade-questions"

const TAG = "examiner-summary"
const CALL_SITE_KEY = "examiner-summary"

const ExaminerSummarySchema = z.object({
	strength: z
		.string()
		.describe(
			"Line 1: What the student did well overall. Max 30 words. Reference specific skills or content from the grading data.",
		),
	weakness: z
		.string()
		.describe(
			"Line 2: The student's main weakness or gap. Max 30 words. Be specific — name the skill or content area.",
		),
	improvement: z
		.string()
		.describe(
			"Line 3: How to improve — one actionable step. Max 30 words. Must be specific enough that the student knows what to do.",
		),
})

const SYSTEM_PROMPT = `You are an expert GCSE examiner writing a brief overall summary for a student.
Write exactly 3 lines: what went well, main weakness, how to improve.
Plain English, student-friendly, no jargon. Each line must be a complete sentence.
Reference specific content from the answers — never be vague or generic.`

type GenerateExaminerSummaryArgs = {
	gradingResults: GradingResult[]
	examPaperTitle: string
	subject: string
	runner: LlmRunner
}

export async function generateExaminerSummary({
	gradingResults,
	examPaperTitle,
	subject,
	runner,
}: GenerateExaminerSummaryArgs): Promise<string | null> {
	if (gradingResults.length === 0) return null

	const totalAwarded = gradingResults.reduce((s, r) => s + r.awarded_score, 0)
	const totalMax = gradingResults.reduce((s, r) => s + r.max_score, 0)
	const pct = totalMax > 0 ? Math.round((totalAwarded / totalMax) * 100) : 0

	const questionSummaries = gradingResults
		.map((r) => {
			const www = r.what_went_well?.join("; ") ?? ""
			const ebi = r.even_better_if?.join("; ") ?? ""
			return `Q${r.question_number} (${r.awarded_score}/${r.max_score}): ${r.feedback_summary}${www ? ` | Strengths: ${www}` : ""}${ebi ? ` | Gaps: ${ebi}` : ""}`
		})
		.join("\n")

	const prompt = `Paper: ${examPaperTitle}
Subject: ${subject}
Overall: ${totalAwarded}/${totalMax} (${pct}%)

Per-question results:
${questionSummaries}

Write a 3-line summary for this student.`

	try {
		const output = await runner.call(
			CALL_SITE_KEY,
			async (model, entry, report) => {
				const result = await generateText({
					model,
					temperature: entry.temperature,
					messages: [
						{ role: "system", content: SYSTEM_PROMPT },
						{ role: "user", content: prompt },
					],
					output: outputSchema(ExaminerSummarySchema),
				})
				report.usage = result.usage
				return result.output
			},
		)

		return `${output.strength}\n${output.weakness}\n${output.improvement}`
	} catch (err) {
		logger.warn(
			TAG,
			"Failed to generate examiner summary — continuing without",
			{ error: String(err) },
		)
		return null
	}
}
