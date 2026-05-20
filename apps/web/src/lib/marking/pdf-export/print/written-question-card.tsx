import type {
	GradingResult,
	PageToken,
	StudentPaperAnnotation,
} from "../../types"
import { marksForQuestion } from "../marks"
import { AnnotatedAnswer } from "./annotated-answer"

function scoreClass(pct: number): string {
	if (pct >= 70) return "score-good"
	if (pct >= 40) return "score-warn"
	return "score-bad"
}


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
