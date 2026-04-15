import { SIGNAL_TO_TIPTAP } from "@/lib/marking/mark-registry"
import type { TextMark } from "@/lib/marking/token-alignment"
import type { GradingResult } from "@/lib/marking/types"
import type { JSONContent } from "@tiptap/core"

// ─── Build text runs with marks from a flat string + TextMark[] ─────────────

function buildTextContent(text: string, marks: TextMark[]): JSONContent[] {
	if (text.length === 0) return [{ type: "text", text: " " }]
	if (marks.length === 0) return [{ type: "text", text }]

	// Collect boundary points
	const boundaries = new Set<number>()
	boundaries.add(0)
	boundaries.add(text.length)
	for (const m of marks) {
		if (m.from >= 0 && m.from <= text.length) boundaries.add(m.from)
		if (m.to >= 0 && m.to <= text.length) boundaries.add(m.to)
	}

	const sorted = [...boundaries].sort((a, b) => a - b)
	const nodes: JSONContent[] = []

	for (let i = 0; i < sorted.length - 1; i++) {
		const start = sorted[i]
		const end = sorted[i + 1]
		if (start === end) continue

		const segText = text.slice(start, end)
		const covering = marks.filter((m) => m.from < end && m.to > start)

		const node: JSONContent = { type: "text", text: segText }

		if (covering.length > 0) {
			node.marks = covering.map((m) => ({
				type: SIGNAL_TO_TIPTAP[m.type],
				attrs: {
					sentiment: m.sentiment,
					reason: (m.attrs.reason as string) ?? null,
					annotationId: m.annotationId,
					...(m.attrs.ao_category
						? {
								ao_category: m.attrs.ao_category ?? null,
								ao_display: m.attrs.ao_display ?? null,
								ao_quality: m.attrs.ao_quality ?? null,
							}
						: {}),
					...(m.attrs.comment ? { comment: m.attrs.comment ?? null } : {}),
					...(m.type === "chain"
						? {
								chainType: m.attrs.chainType ?? "reasoning",
								phrase: m.attrs.phrase ?? null,
							}
						: {}),
					// Carry scan metadata through for lossless round-trip
					scanBbox: m.attrs.scanBbox ?? null,
					scanPageOrder: m.attrs.scanPageOrder ?? null,
					scanTokenStartId: m.attrs.scanTokenStartId ?? null,
					scanTokenEndId: m.attrs.scanTokenEndId ?? null,
				},
			}))
		}

		nodes.push(node)
	}

	return nodes.length > 0 ? nodes : [{ type: "text", text }]
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Builds a tiptap-compatible JSON document from grading results and text marks.
 * Each non-MCQ question becomes a `questionAnswer` block node.
 */
export function buildAnnotatedDoc(
	gradingResults: GradingResult[],
	marksByQuestion: Map<string, TextMark[]>,
): JSONContent {
	const blocks: JSONContent[] = []

	// Group all MCQ questions into a single table node
	const mcqResults = gradingResults.filter(
		(r) => r.marking_method === "deterministic",
	)
	if (mcqResults.length > 0) {
		blocks.push({
			type: "mcqTable",
			attrs: {
				results: mcqResults.map((r) => ({
					questionId: r.question_id,
					questionNumber: r.question_number,
					questionText: r.question_text || null,
					maxScore: r.max_score,
					options: r.multiple_choice_options ?? [],
					correctLabels: r.correct_option_labels ?? [],
					studentAnswer: r.student_answer,
					awardedScore: r.awarded_score,
				})),
			},
		})
	}

	// Written questions as individual blocks
	for (const r of gradingResults) {
		if (r.marking_method === "deterministic") continue

		const marks = marksByQuestion.get(r.question_id) ?? []
		const content = buildTextContent(r.student_answer, marks)

		blocks.push({
			type: "questionAnswer",
			attrs: {
				questionId: r.question_id,
				questionNumber: r.question_number,
				questionText: r.question_text || null,
				maxScore: r.max_score,
			},
			content,
		})
	}

	// If no blocks, add an empty paragraph to satisfy PM schema
	if (blocks.length === 0) {
		blocks.push({
			type: "questionAnswer",
			attrs: { questionId: null, questionNumber: null },
			content: [{ type: "text", text: "No answers to display." }],
		})
	}

	return { type: "doc", content: blocks }
}
