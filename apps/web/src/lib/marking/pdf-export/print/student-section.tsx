import { computeGrade } from "@mcp-gcse/shared"
import type {
	PageToken,
	StudentPaperAnnotation,
	StudentPaperResultPayload,
} from "../../types"
import { McqTable } from "./mcq-table"
import { WrittenQuestionCard } from "./written-question-card"

function scoreClass(pct: number): string {
	if (pct >= 70) return "score-good"
	if (pct >= 40) return "score-warn"
	return "score-bad"
}

export function StudentSection({
	student,
	annotations,
	pageTokens,
}: {
	student: StudentPaperResultPayload
	annotations: StudentPaperAnnotation[]
	pageTokens: PageToken[]
}) {
	const pct =
		student.total_max > 0
			? Math.round((student.total_awarded / student.total_max) * 100)
			: 0
	const grade = computeGrade(
		student.total_awarded,
		student.total_max,
		student.grade_boundaries,
		student.grade_boundary_mode ?? "percent",
	)

	const mcqResults = student.grading_results.filter(
		(r) => r.marking_method === "deterministic",
	)
	const writtenResults = student.grading_results.filter(
		(r) => r.marking_method !== "deterministic",
	)

	const studentName = student.student_name ?? "Unnamed student"

	return (
		<section className="student-section">
			<header className="student-header">
				<div>
					<h1 className="h1">{studentName}</h1>
					{student.exam_paper_title ? (
						<p className="small-muted">{student.exam_paper_title}</p>
					) : null}
				</div>
				<div className="right">
					<h2 className={`h2 ${scoreClass(pct)}`} style={{ marginBottom: 0 }}>
						{student.total_awarded}/{student.total_max} ({pct}%)
					</h2>
					{grade ? <p className="small-muted">Grade {grade}</p> : null}
				</div>
			</header>

			{student.examiner_summary ? (
				<div className="examiner-summary">
					<h3 className="h3">Examiner summary</h3>
					<p>{student.examiner_summary}</p>
				</div>
			) : null}

			<div className="rule" />

			<McqTable results={mcqResults} />

			{writtenResults.map((r) => (
				<WrittenQuestionCard
					key={r.question_id}
					result={r}
					annotations={annotations}
					pageTokens={pageTokens}
				/>
			))}
		</section>
	)
}
