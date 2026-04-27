import { z } from "zod"

/**
 * Zod schemas describing the runtime shape of `questionAnswer` and `mcqTable`
 * node attrs. These are the canonical types used by both the write side
 * (dispatchers in `editor-ops.ts`) and the read side (NodeViews in
 * `apps/web/src/components/annotated-answer/`).
 *
 * Parsing happens at the doc/React boundary: NodeViews call `*.parse(node.attrs)`
 * once at mount, after which the typed object is consumed without casts.
 *
 * Strictness policy: nullable fields use `.nullable().default(null)` so that
 * `undefined` on the wire (from legacy partial rows or older docs that
 * predated a field) coerces to `null` rather than throwing. We choose
 * leniency-on-read because:
 *   - real docs have been written by varied codepaths over time;
 *   - production writers (e.g. editor-seed.ts) always supply the full
 *     shape, so the leniency only kicks in for stragglers.
 * A field that's neither `null`-defaulted nor `.default([])`-defaulted is
 * load-bearing — its absence is a real corruption and should throw.
 */

const nullableNumber = () => z.number().nullable().default(null)
const nullableString = () => z.string().nullable().default(null)

const markingMethodSchema = z
	.enum(["deterministic", "point_based", "level_of_response"])
	.nullable()
	.default(null)

const markPointResultSchema = z.object({
	pointNumber: z.number(),
	awarded: z.boolean(),
	reasoning: z.string(),
	expectedCriteria: z.string().optional(),
	studentCovered: z.string().optional(),
})

export const teacherOverrideAttrsSchema = z.object({
	score: z.number().nullable(),
	reason: z.string().nullable(),
	feedback: z.string().nullable(),
	setBy: z.string().nullable(),
	setAt: z.string().nullable(),
})

export type TeacherOverrideAttrs = z.infer<typeof teacherOverrideAttrsSchema>

/** AI-grade fields baked onto the `questionAnswer` block by the grade Lambda. */
export const questionGradeAttrsSchema = z.object({
	awardedScore: nullableNumber(),
	markingMethod: markingMethodSchema,
	llmReasoning: nullableString(),
	feedbackSummary: nullableString(),
	whatWentWell: z.array(z.string()).default([]),
	evenBetterIf: z.array(z.string()).default([]),
	markPointsResults: z.array(markPointResultSchema).default([]),
	levelAwarded: nullableNumber(),
	whyNotNextLevel: nullableString(),
	capApplied: nullableString(),
	markSchemeId: nullableString(),
})

export type QuestionGradeAttrs = z.infer<typeof questionGradeAttrsSchema>

export const questionAnswerAttrsSchema = z
	.object({
		questionId: nullableString(),
		questionNumber: nullableString(),
		questionText: nullableString(),
		maxScore: nullableNumber(),
		teacherOverride: teacherOverrideAttrsSchema.nullable().default(null),
		teacherFeedbackOverride: nullableString(),
	})
	.extend(questionGradeAttrsSchema.shape)

export type QuestionAnswerAttrs = z.infer<typeof questionAnswerAttrsSchema>

export const mcqRowSchema = z.object({
	questionId: z.string(),
	questionNumber: z.string(),
	questionText: nullableString(),
	maxScore: z.number(),
	options: z.array(
		z.object({
			option_label: z.string(),
			option_text: z.string(),
		}),
	),
	correctLabels: z.array(z.string()),
	studentAnswer: nullableString(),
	awardedScore: nullableNumber(),
	markingMethod: markingMethodSchema,
	feedbackSummary: nullableString(),
	llmReasoning: nullableString(),
	whatWentWell: z.array(z.string()).default([]),
	evenBetterIf: z.array(z.string()).default([]),
	markPointsResults: z.array(markPointResultSchema).default([]),
	levelAwarded: nullableNumber(),
	whyNotNextLevel: nullableString(),
	capApplied: nullableString(),
	markSchemeId: nullableString(),
	teacherOverride: teacherOverrideAttrsSchema.nullable().default(null),
	teacherFeedbackOverride: nullableString(),
})

export type McqRow = z.infer<typeof mcqRowSchema>

export const mcqTableAttrsSchema = z.object({
	results: z.array(mcqRowSchema).default([]),
})

export type McqTableAttrs = z.infer<typeof mcqTableAttrsSchema>
