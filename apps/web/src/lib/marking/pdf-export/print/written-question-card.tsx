import { parseMarkdownTable } from "@/lib/markdown-table"
import type {
	GradingResult,
	PageToken,
	ResultStimulus,
	StudentPaperAnnotation,
} from "../../types"
import { marksForQuestion } from "../marks"
import { AnnotatedAnswer } from "./annotated-answer"

function scoreClass(pct: number): string {
	if (pct >= 70) return "score-good"
	if (pct >= 40) return "score-warn"
	return "score-bad"
}

function StimulusBody({ stim }: { stim: ResultStimulus }) {
	const kind = stim.content_type ?? "text"

	if (kind === "table") {
		const parsed = parseMarkdownTable(stim.content)
		if (parsed) {
			return (
				<table className="stimulus-table">
					<thead>
						<tr>
							{parsed.headers.map((h, i) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: header order is stable per stimulus
								<th key={`h-${i}`}>{h}</th>
							))}
						</tr>
					</thead>
					<tbody>
						{parsed.rows.map((row, ri) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: row order is stable per stimulus
							<tr key={`r-${ri}`}>
								{row.map((cell, ci) => (
									// biome-ignore lint/suspicious/noArrayIndexKey: cell order is stable per row
									<td key={`r-${ri}-c-${ci}`}>{cell}</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			)
		}
		// Falls through to text render when the table doesn't parse.
	}

	if (kind === "image") {
		// Phase 4+: when extractor emits image stimuli, embed via data URI.
		return (
			<p className="stimulus-image-placeholder">
				[Image stimulus — not yet rendered in report]
			</p>
		)
	}

	return <p className="stimulus-content">{stim.content}</p>
}

/**
 * Renders one written-answer question card. When `annotations` + `tokens`
 * are supplied (and `marksForQuestion` finds something to project onto
 * the OCR'd answer), the answer renders through `AnnotatedAnswer` with
 * inline marks; otherwise it falls back to plain text.
 *
 * Annotation passing is the only Phase 4 change to this component —
 * everything else (header, stimuli, question text, WWW/EBI) is unchanged.
 */
export function WrittenQuestionCard({
	result,
	annotations,
	pageTokens,
}: {
	result: GradingResult
	annotations: StudentPaperAnnotation[]
	pageTokens: PageToken[]
}) {
	const pct =
		result.max_score > 0
			? Math.round((result.awarded_score / result.max_score) * 100)
			: 0
	const levelTag =
		result.marking_method === "level_of_response" &&
		result.level_awarded !== undefined
			? `  [Level ${result.level_awarded}]`
			: ""
	const answerText = result.student_answer?.trim() || "(No answer written)"
	const marks = marksForQuestion(result, annotations, pageTokens)

	return (
		<div className="question-card">
			<div className="question-header">
				<span className="question-number">Q{result.question_number}</span>
				<span className={`question-score ${scoreClass(pct)}`}>
					{result.awarded_score}/{result.max_score}
					{levelTag}
				</span>
			</div>

			{result.stimuli && result.stimuli.length > 0
				? result.stimuli.map((s) => (
						<div key={s.label} className="stimulus-box">
							<div className="stimulus-label">{s.label}</div>
							<StimulusBody stim={s} />
						</div>
					))
				: null}

			<p className="question-text">{result.question_text}</p>

			{marks.length > 0 ? (
				<AnnotatedAnswer answerText={answerText} marks={marks} />
			) : (
				<div className="answer-box">
					<p className="answer-text">{answerText}</p>
				</div>
			)}

			{result.what_went_well && result.what_went_well.length > 0 ? (
				<>
					<div className="bullet-heading www">What went well</div>
					<ul className="bullet-list">
						{result.what_went_well.map((b, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: feedback bullets
							<li key={`ww-${i}`}>{b}</li>
						))}
					</ul>
				</>
			) : null}

			{result.even_better_if && result.even_better_if.length > 0 ? (
				<>
					<div className="bullet-heading ebi">Even better if</div>
					<ul className="bullet-list">
						{result.even_better_if.map((b, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: feedback bullets
							<li key={`ebi-${i}`}>{b}</li>
						))}
					</ul>
				</>
			) : null}
		</div>
	)
}
