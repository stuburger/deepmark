import { Node, mergeAttributes } from "@tiptap/core"

/**
 * Schema-only definition of the `questionAnswer` block. Used by both the web
 * editor (which extends it with a React NodeView and keyboard shortcuts) and
 * server-side getSchema() callers (Lambda, projection handler) that need
 * byte-identical schemas to round-trip Y.Doc state without errors.
 */
export const QuestionAnswerNodeSchema = Node.create({
	name: "questionAnswer",
	group: "block",
	content: "inline*",
	draggable: false,
	isolating: true,

	addAttributes() {
		return {
			questionId: { default: null },
			questionNumber: { default: null },
			questionText: { default: null },
			maxScore: { default: null },
			/**
			 * Marks awarded by the AI examiner for this question. `null` until
			 * grading completes; integer once dispatched by the grade Lambda.
			 * Authoritative source — renderers (editor inline indicator, scan
			 * view tick overlay) read this attr; no separate annotation row
			 * carries the score.
			 */
			awardedScore: { default: null },
			/**
			 * Discriminator: "deterministic" | "point_based" | "level_of_response".
			 * Drives marker-method-specific UI (e.g. LoR shows level descriptors
			 * panel; point_based shows mark-points breakdown).
			 */
			markingMethod: { default: null },
			/** AI-authored prose explaining how marks were awarded. */
			llmReasoning: { default: null },
			/** Short examiner-style summary shown to the teacher / student. */
			feedbackSummary: { default: null },
			/** Bullet list of strengths (rendered as the WWW badge panel). */
			whatWentWell: { default: [] },
			/** Bullet list of improvements (rendered as the EBI badge panel). */
			evenBetterIf: { default: [] },
			/** Per-mark-point breakdown for point_based questions. */
			markPointsResults: { default: [] },
			/** LoR: integer level number that was awarded. */
			levelAwarded: { default: null },
			/** LoR: prose explaining why the next level wasn't reached. */
			whyNotNextLevel: { default: null },
			/** LoR: human-readable label for any cap that was applied. */
			capApplied: { default: null },
			/** Owning mark scheme id (FK back to MarkScheme for joins). */
			markSchemeId: { default: null },
			/**
			 * Teacher score override. `null` when the teacher has accepted the
			 * AI's `awardedScore`. Carries an integer override + optional
			 * reason and a `setBy` user id for audit. Renderers prefer
			 * `teacherOverride.score` when present.
			 */
			teacherOverride: { default: null },
			/**
			 * Teacher feedback override. Replaces `feedbackSummary` in the UI
			 * when present; null = use AI feedback.
			 */
			teacherFeedbackOverride: { default: null },
		}
	},

	parseHTML() {
		return [{ tag: "div[data-question-id]" }]
	},

	renderHTML({ HTMLAttributes }) {
		return [
			"div",
			mergeAttributes(HTMLAttributes, {
				"data-question-id": HTMLAttributes.questionId,
				"data-question-number": HTMLAttributes.questionNumber,
			}),
			0,
		]
	},
})
