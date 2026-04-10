"use server"

import { createPrismaClient } from "@mcp-gcse/db"
import { Output, generateText } from "ai"
import { Resource } from "sst"
import { z } from "zod"
import { auth } from "../auth"
import { callLlmWithFallback } from "../llm-runtime"
import { log } from "../logger"

const TAG = "autofill-mark-scheme-actions"
const db = createPrismaClient(Resource.NeonPostgres.databaseUrl)

export type AutofillMarkPointSuggestion = {
	description: string
	points: number
}

export type AutofillMarkSchemeSuggestion =
	| {
			marking_method: "deterministic"
			description: string
			correct_option_labels: string[]
	  }
	| {
			marking_method: "point_based"
			description: string
			guidance: string
			mark_points: AutofillMarkPointSuggestion[]
	  }

export type AutofillMarkSchemeResult =
	| { ok: true; suggestion: AutofillMarkSchemeSuggestion }
	| { ok: false; error: string }

const McqSchema = z.object({
	correct_option_label: z.string(),
	description: z.string(),
})

const WrittenSchema = z.object({
	description: z.string(),
	guidance: z.string(),
	mark_points: z.array(
		z.object({
			description: z.string(),
			points: z.number().int(),
		}),
	),
})

type McqOption = { option_label: string; option_text: string }

/**
 * Calls the LLM to generate a mark scheme suggestion for a question.
 * Returns suggestion data for the teacher to review in the form before saving.
 * Nothing is persisted by this action.
 */
export async function autofillMarkScheme(
	questionId: string,
): Promise<AutofillMarkSchemeResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	log.info(TAG, "autofillMarkScheme called", {
		userId: session.userId,
		questionId,
	})

	try {
		const question = await db.question.findUnique({
			where: { id: questionId },
			select: {
				id: true,
				text: true,
				question_type: true,
				points: true,
				subject: true,
				topic: true,
				multiple_choice_options: true,
			},
		})

		if (!question) return { ok: false, error: "Question not found" }

		if (question.question_type === "multiple_choice") {
			const rawOptions = Array.isArray(question.multiple_choice_options)
				? (question.multiple_choice_options as McqOption[])
				: []

			if (rawOptions.length === 0) {
				return {
					ok: false,
					error: "No multiple choice options found on this question",
				}
			}

			const optionsText = rawOptions
				.map((o) => `${o.option_label}: ${o.option_text}`)
				.join("\n")

			const prompt = `You are an expert GCSE examiner. Identify the correct answer for the following multiple choice question.

Question: ${question.text}

Options:
${optionsText}

Return JSON with:
- correct_option_label: the single letter of the correct answer (e.g. "B")
- description: the single letter of the correct answer only (e.g. "B") — nothing else

Only return the letter for both fields (e.g. "A", "B", "C", or "D").`

			const { output } = await callLlmWithFallback(
				"mark-scheme-autofill",
				async (model) =>
					generateText({
						model,
						messages: [{ role: "user", content: prompt }],
						output: Output.object({ schema: McqSchema }),
					}),
			)

			const label = output.correct_option_label.trim().toUpperCase()
			const validLabels = rawOptions.map((o) => o.option_label.toUpperCase())
			if (!validLabels.includes(label)) {
				return {
					ok: false,
					error: `AI returned unrecognised option label "${label}"`,
				}
			}

			log.info(TAG, "MCQ autofill complete", {
				userId: session.userId,
				questionId,
				correct: label,
			})

			return {
				ok: true,
				suggestion: {
					marking_method: "deterministic",
					description: label,
					correct_option_labels: [label],
				},
			}
		}

		// Written question — generate point-based mark scheme
		const marksAvailable = question.points ?? 1
		const subjectContext = [question.subject, question.topic]
			.filter(Boolean)
			.join(", ")

		const prompt = `You are an expert GCSE examiner. Generate a point-based mark scheme for the following question.

Subject: ${subjectContext || "Unknown"}
Question: ${question.text}
Marks available: ${marksAvailable}

Rules:
- Create mark points that together add up to exactly ${marksAvailable} mark${marksAvailable !== 1 ? "s" : ""}.
- Each mark point should be a clear, concise criterion a student must meet to earn that mark.
- Use GCSE-style language (specific, knowledge-based criteria).
- The description field should be a brief overall summary of what a correct answer should include.
- The guidance field should provide any useful notes for the marker (or empty string if none).

Return JSON with:
- description: overall summary of what the answer should cover (1-2 sentences)
- guidance: marker guidance notes (or "" if none)
- mark_points: array of { description: string, points: number } — must sum to ${marksAvailable}`

		const { output } = await callLlmWithFallback(
			"mark-scheme-autofill",
			async (model) =>
				generateText({
					model,
					messages: [{ role: "user", content: prompt }],
					output: Output.object({ schema: WrittenSchema }),
				}),
		)

		if (!output.mark_points || output.mark_points.length === 0) {
			return { ok: false, error: "AI did not generate any mark points" }
		}

		log.info(TAG, "Written autofill complete", {
			userId: session.userId,
			questionId,
			mark_points_count: output.mark_points.length,
		})

		return {
			ok: true,
			suggestion: {
				marking_method: "point_based",
				description: output.description.trim(),
				guidance: output.guidance.trim(),
				mark_points: output.mark_points.map((mp) => ({
					description: mp.description.trim(),
					points: Math.max(1, Math.round(mp.points)),
				})),
			},
		}
	} catch (err) {
		log.error(TAG, "autofillMarkScheme failed", {
			userId: session.userId,
			questionId,
			error: String(err),
		})
		return { ok: false, error: "Autofill failed. Please try again." }
	}
}
