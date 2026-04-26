import type { JSONContent } from "@tiptap/core"
import type { TextMark, TokenAlignment } from "./alignment/types"
import { SIGNAL_TO_TIPTAP } from "./mark-registry"
import { type SegmentMark, segmentText } from "./segment-text"
import type {
	ExamPaperQuestion,
	ExtractedAnswer,
	GradingResult,
	PageToken,
} from "./types"

// ─── Token range: inverted view of a TokenAlignment for mark generation ─────

type TokenRange = {
	from: number
	to: number
	tokenId: string
	bbox: [number, number, number, number]
	pageOrder: number
}

/** Invert a TokenAlignment + token list into sorted char ranges with bbox. */
function tokenRangesFromAlignment(
	alignment: TokenAlignment,
	tokens: PageToken[],
): TokenRange[] {
	const tokenLookup = new Map<string, PageToken>()
	for (const t of tokens) tokenLookup.set(t.id, t)

	const ranges: TokenRange[] = []
	for (const [tokenId, offset] of Object.entries(alignment.tokenMap)) {
		const token = tokenLookup.get(tokenId)
		if (!token) continue
		ranges.push({
			from: offset.start,
			to: offset.end,
			tokenId,
			bbox: token.bbox,
			pageOrder: token.page_order,
		})
	}

	ranges.sort((a, b) => a.from - b.from)
	return ranges
}

// ─── Build text runs with marks from a flat string + TextMark[] ─────────────

function buildTextContent(
	text: string,
	marks: TextMark[],
	tokenRanges: TokenRange[],
): JSONContent[] {
	if (text.length === 0) return [{ type: "text", text: " " }]

	const segmentMarks: SegmentMark[] = marks.map((m) => ({
		from: m.from,
		to: m.to,
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
			scanBbox: m.attrs.scanBbox ?? null,
			scanPageOrder: m.attrs.scanPageOrder ?? null,
			scanTokenStartId: m.attrs.scanTokenStartId ?? null,
			scanTokenEndId: m.attrs.scanTokenEndId ?? null,
		},
	}))

	const nodes = segmentText(text, segmentMarks, tokenRanges)
	return nodes.length > 0 ? nodes : [{ type: "text", text }]
}

/**
 * Builds a tiptap-compatible JSON document from grading results, text marks,
 * and token alignment data. Each non-MCQ question becomes a `questionAnswer`
 * block node whose text content carries both annotation marks AND ocrToken
 * marks binding each word to its scan bounding box.
 *
 * When `examinerSummary` is non-empty, a leading `paragraph` block is
 * prepended (teacher notes / AI examiner summary seed).
 *
 * When `grading_results` is empty but `examPaperQuestions` is provided,
 * skeleton blocks are built from the exam paper structure so the teacher
 * sees the question layout while processing is underway. If
 * `extractedAnswers` are also present (OCR done, grading pending), each
 * skeleton block is pre-populated with the OCR text.
 */
export function buildAnnotatedDoc(
	gradingResults: GradingResult[],
	marksByQuestion: Map<string, TextMark[]>,
	alignmentByQuestion: Map<string, TokenAlignment>,
	tokensByQuestion: Map<string, PageToken[]>,
	examinerSummary?: string | null,
	examPaperQuestions?: ExamPaperQuestion[] | null,
	extractedAnswers?: ExtractedAnswer[] | null,
): JSONContent {
	const blocks: JSONContent[] = []

	if (examinerSummary) {
		blocks.push({
			type: "paragraph",
			content: [{ type: "text", text: examinerSummary }],
		})
	}

	if (gradingResults.length > 0) {
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

		for (const r of gradingResults) {
			if (r.marking_method === "deterministic") continue

			const marks = marksByQuestion.get(r.question_id) ?? []
			const alignment = alignmentByQuestion.get(r.question_id)
			const tokens = tokensByQuestion.get(r.question_id)
			const tokenRanges =
				alignment && tokens ? tokenRangesFromAlignment(alignment, tokens) : []

			const content = buildTextContent(r.student_answer, marks, tokenRanges)

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

		return { type: "doc", content: blocks }
	}

	if (examPaperQuestions && examPaperQuestions.length > 0) {
		const extractedByNumber = new Map<string, string>()
		for (const ea of extractedAnswers ?? []) {
			extractedByNumber.set(ea.question_number, ea.answer_text)
		}

		const mcqQuestions = examPaperQuestions.filter(
			(q) => q.marking_method === "deterministic",
		)
		if (mcqQuestions.length > 0) {
			blocks.push({
				type: "mcqTable",
				attrs: {
					results: mcqQuestions.map((q) => ({
						questionId: q.question_id,
						questionNumber: q.question_number,
						questionText: q.question_text || null,
						maxScore: q.max_score,
						options: q.multiple_choice_options,
						correctLabels: q.correct_option_labels,
						studentAnswer: extractedByNumber.get(q.question_number) ?? null,
						awardedScore: 0,
					})),
				},
			})
		}

		for (const q of examPaperQuestions) {
			if (q.marking_method === "deterministic") continue

			const ocrText = extractedByNumber.get(q.question_number) ?? ""

			blocks.push({
				type: "questionAnswer",
				attrs: {
					questionId: q.question_id,
					questionNumber: q.question_number,
					questionText: q.question_text || null,
					maxScore: q.max_score,
				},
				content: [{ type: "text", text: ocrText || " " }],
			})
		}

		return { type: "doc", content: blocks }
	}

	blocks.push({
		type: "questionAnswer",
		attrs: { questionId: null, questionNumber: null },
		content: [{ type: "text", text: "Waiting for student answers…" }],
	})

	return { type: "doc", content: blocks }
}
