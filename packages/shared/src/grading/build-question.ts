import { parseMarkPointsFromPrisma } from "./grader-prisma"
import type { QuestionWithMarkScheme } from "./types"

// ============================================
// BUILD QUESTION WITH MARK SCHEME
// ============================================

export interface BuildQuestionInput {
	questionId: string
	questionText: string
	topic: string
	questionType: string
	multipleChoiceOptions?: unknown
	markScheme: {
		description: string
		guidance?: string | null
		pointsTotal: number
		markPoints: unknown
		markingMethod?: string | null
		correctOptionLabels?: string[]
		content?: string | null
	}
	/** Stimuli in display order. Omit when the question has no attached content. */
	stimuli?: Array<{ label: string; content: string }>
}

/**
 * Parse raw MCQ option JSON (array of {option_label, option_text}) into domain shape.
 * Returns undefined if input is not a valid non-empty array.
 */
export function parseMultipleChoiceOptions(
	json: unknown,
): Array<{ optionLabel: string; optionText: string }> | undefined {
	if (!Array.isArray(json)) return undefined
	const opts = json
		.filter(
			(item): item is Record<string, unknown> =>
				item !== null &&
				typeof item === "object" &&
				"option_label" in item &&
				"option_text" in item,
		)
		.map((item) => ({
			optionLabel: String(item.option_label),
			optionText: String(item.option_text),
		}))
	return opts.length > 0 ? opts : undefined
}

function normalizeMarkingMethod(
	raw?: string | null,
): "deterministic" | "point_based" | "level_of_response" | undefined {
	if (
		raw === "deterministic" ||
		raw === "point_based" ||
		raw === "level_of_response"
	)
		return raw
	return undefined
}

/**
 * Build a QuestionWithMarkScheme domain object from flat question + mark scheme data.
 * Handles all internal parsing (mark points, MCQ options, type normalization).
 */
export function buildQuestionWithMarkScheme(
	input: BuildQuestionInput,
): QuestionWithMarkScheme {
	const { questionId, questionText, topic, questionType, markScheme } = input

	return {
		id: questionId,
		questionType:
			questionType === "multiple_choice" ? "multiple_choice" : "written",
		questionText,
		topic,
		rubric: markScheme.description,
		guidance: markScheme.guidance,
		totalPoints: markScheme.pointsTotal,
		markPoints: parseMarkPointsFromPrisma(markScheme.markPoints),
		correctOptionLabels: markScheme.correctOptionLabels,
		availableOptions: parseMultipleChoiceOptions(input.multipleChoiceOptions),
		markingMethod: normalizeMarkingMethod(markScheme.markingMethod),
		content: markScheme.content ?? null,
		stimuli:
			input.stimuli && input.stimuli.length > 0 ? input.stimuli : undefined,
	}
}
