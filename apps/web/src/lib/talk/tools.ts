import { tool } from "ai"
import { z } from "zod"

/**
 * Talk to DeepMark tool surface. These schemas define the structured
 * intents the model can emit; the route registers them with streamText
 * (no `execute` — the client resolves each via `onToolCall` / `addToolResult`).
 *
 * Phase A (this commit): schemas defined, signal↔mark mapping ready,
 * NOT yet wired into the route or client handlers.
 * Phase B: route registers, client dispatches, override surfaces as a
 * confirm card in the conversation.
 *
 * Token IDs come from `student_paper_page_tokens.id`. The preamble exposes
 * existing-annotation token ranges so the model has reference examples.
 *
 * AnnotationId is a UUID generated client-side at apply time; the model
 * receives it back via the tool result so it can reference the same
 * annotation in follow-up calls (update / remove).
 */

const MARK_SIGNAL = z.enum([
	"tick",
	"cross",
	"underline",
	"double_underline",
	"box",
	"circle",
])

const AO_QUALITY = z.enum(["strong", "partial", "incorrect", "valid"])

/** Common AnnotationPayload-shaped fields the model can set on a mark. */
const annotationFields = {
	signal: MARK_SIGNAL,
	reason: z
		.string()
		.min(1)
		.describe(
			"Short examiner-style note explaining what the mark refers to. Required on every annotation.",
		),
	comment: z
		.string()
		.optional()
		.describe(
			"Optional longer comment shown in the margin / sidebar. Use for explanations beyond the short reason.",
		),
	ao_category: z
		.string()
		.optional()
		.describe(
			'AO category code, e.g. "AO1", "AO2". Only set when the mark scheme explicitly assigns the credit to a specific AO.',
		),
	ao_display: z
		.string()
		.optional()
		.describe(
			'Board-specific short label shown on the mark, e.g. "AO2", "App", "K". Optional.',
		),
	ao_quality: AO_QUALITY.optional().describe(
		"Quality of the AO skill demonstration. Use 'strong' / 'partial' / 'incorrect' / 'valid' per the existing toolbar vocabulary.",
	),
	label: z
		.string()
		.max(20)
		.optional()
		.describe('Optional short marginal label, e.g. "3/4" for a sub-mark.'),
} as const

const addAnnotationInput = z.object({
	questionId: z
		.string()
		.describe("ID of the question this annotation lives on."),
	tokenStart: z
		.string()
		.describe(
			"OCR token id where the mark starts (inclusive). Use the token ids exposed in the submission preamble.",
		),
	tokenEnd: z
		.string()
		.describe("OCR token id where the mark ends (inclusive)."),
	...annotationFields,
})

const updateAnnotationInput = z.object({
	annotationId: z.string().describe("UUID of the annotation to update."),
	signal: MARK_SIGNAL.optional(),
	reason: z.string().min(1).optional(),
	comment: z.string().optional(),
	ao_category: z.string().optional(),
	ao_display: z.string().optional(),
	ao_quality: AO_QUALITY.optional(),
	label: z.string().max(20).optional(),
})

const removeAnnotationInput = z.object({
	annotationId: z.string().describe("UUID of the annotation to remove."),
})

const proposeTeacherOverrideInput = z.object({
	questionId: z.string(),
	suggestedScore: z
		.number()
		.int()
		.min(0)
		.describe(
			"Proposed score for the question. Must be between 0 and the question's max_score.",
		),
	reason: z
		.string()
		.min(1)
		.describe(
			"Examiner-style justification shown on the confirm card and persisted as the override reason on accept.",
		),
})

const linkToScanInput = z.object({
	questionId: z.string(),
	tokenStart: z.string().optional(),
	tokenEnd: z.string().optional(),
})

/**
 * Builds the tool object passed to `streamText`. Tools are only registered
 * when a submissionId is present — general-assistant mode (dashboard,
 * /teacher/talk) gets a tool-less prompt. The factory is a thin layer so
 * we can pre-bind submission-scoped context later if needed.
 */
export function buildTalkTools(submissionId: string | undefined) {
	if (!submissionId) return undefined
	return {
		addAnnotation: tool({
			description:
				"Add a new annotation mark to the student's answer. Use the 6 existing signal types (tick, cross, underline, double_underline, box, circle). Tag with AO when the mark scheme explicitly credits an AO.",
			inputSchema: addAnnotationInput,
		}),
		updateAnnotation: tool({
			description:
				"Update an existing annotation's payload (signal, comment, AO tags, label). Reference by annotationId returned from a prior add.",
			inputSchema: updateAnnotationInput,
		}),
		removeAnnotation: tool({
			description:
				"Remove an existing annotation from the student's answer. Reference by annotationId.",
			inputSchema: removeAnnotationInput,
		}),
		proposeTeacherOverride: tool({
			description:
				"Propose a score override for a question. This does NOT apply directly — it surfaces a confirm card in the conversation that the teacher must accept. Only call this when the teacher explicitly disputes a mark or signals the score is wrong. Never propose unsolicited overrides.",
			inputSchema: proposeTeacherOverrideInput,
		}),
		linkToScan: tool({
			description:
				"Scroll the scan view to a question (and optionally to a specific token range). UI navigation only; no data is modified.",
			inputSchema: linkToScanInput,
		}),
	}
}

export type AddAnnotationInput = z.infer<typeof addAnnotationInput>
export type UpdateAnnotationInput = z.infer<typeof updateAnnotationInput>
export type RemoveAnnotationInput = z.infer<typeof removeAnnotationInput>
export type ProposeTeacherOverrideInput = z.infer<
	typeof proposeTeacherOverrideInput
>
export type LinkToScanInput = z.infer<typeof linkToScanInput>

/**
 * Translate the API-facing `signal` enum to the TipTap mark name registered
 * on the editor. The TipTap names differ for two signals (underline vs the
 * formatting underline; doubleUnderline camelCase) — single source of truth
 * for the mapping lives here so both the tool dispatcher and any future
 * server-side validation stay in sync.
 */
export function signalToMarkName(signal: z.infer<typeof MARK_SIGNAL>): string {
	switch (signal) {
		case "tick":
			return "tick"
		case "cross":
			return "cross"
		case "underline":
			return "annotationUnderline"
		case "double_underline":
			return "doubleUnderline"
		case "box":
			return "box"
		case "circle":
			return "circle"
	}
}
