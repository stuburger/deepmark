import type { GradingResult } from "../../types"

export function McqTable({ results }: { results: GradingResult[] }) {
	if (results.length === 0) return null

	const totalAwarded = results.reduce((s, r) => s + r.awarded_score, 0)
	const totalMax = results.reduce((s, r) => s + r.max_score, 0)

	return (
		<div className="question-card">
			<h3 className="h3">Multiple choice questions</h3>
			<table className="mcq-table">
				<thead>
					<tr>
						<th className="col-q">Q</th>
						<th className="col-correct">Correct</th>
						<th>Student</th>
						<th className="col-mark">Mark</th>
					</tr>
				</thead>
				<tbody>
					{results.map((r) => {
						const correct = r.correct_option_labels?.[0] ?? "-"
						const student = r.student_answer?.trim() || "-"
						const isCorrect = r.awarded_score > 0
						return (
							<tr key={r.question_id}>
								<td className="col-q">Q{r.question_number}</td>
								<td className="col-correct">{correct}</td>
								<td>{student}</td>
								<td
									className={`col-mark ${isCorrect ? "score-good" : "score-bad"}`}
								>
									{r.awarded_score}/{r.max_score}
								</td>
							</tr>
						)
					})}
				</tbody>
				<tfoot>
					<tr>
						<td className="col-q">Total</td>
						<td className="col-correct" />
						<td />
						<td className="col-mark">
							{totalAwarded}/{totalMax}
						</td>
					</tr>
				</tfoot>
			</table>
		</div>
	)
}
