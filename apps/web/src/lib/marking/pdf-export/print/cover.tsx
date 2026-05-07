import { computeGrade } from "@mcp-gcse/shared"
import type { StudentPaperResultPayload } from "../../types"
import type { ClassExportMeta } from "../types"

function formatDate(d: Date): string {
	return new Intl.DateTimeFormat("en-GB", {
		day: "2-digit",
		month: "long",
		year: "numeric",
	}).format(new Date(d))
}

function averagePercent(students: StudentPaperResultPayload[]): number {
	const scored = students.filter((s) => s.total_max > 0)
	if (scored.length === 0) return 0
	const total = scored.reduce(
		(acc, s) => acc + (s.total_awarded / s.total_max) * 100,
		0,
	)
	return Math.round(total / scored.length)
}

function pctClass(pct: number): string {
	if (pct >= 70) return "score-good"
	if (pct >= 40) return "score-warn"
	return "score-bad"
}

export function Cover({
	meta,
	students,
}: {
	meta: ClassExportMeta
	students: StudentPaperResultPayload[]
}) {
	const showGrade = students.some(
		(s) => s.grade_boundaries && s.grade_boundaries.length > 0,
	)
	const avg = averagePercent(students)

	return (
		<section className="cover">
			<h1 className="h1">Class report</h1>
			{meta.paperTitle ? (
				<p className="small-muted">{meta.paperTitle}</p>
			) : null}

			<div className="meta-line">
				{meta.className ? <span>Class: {meta.className}</span> : null}
				{meta.teacherName ? <span>Teacher: {meta.teacherName}</span> : null}
				<span>Generated {formatDate(meta.generatedAt)}</span>
			</div>

			<div className="meta-line">
				<span>
					{students.length} submission{students.length !== 1 ? "s" : ""}
				</span>
				<span>Class average: {avg}%</span>
			</div>

			<div style={{ marginTop: "20pt" }}>
				<h3 className="h3">Summary</h3>
				<table className="summary-table">
					<thead>
						<tr>
							<th>Student</th>
							<th className="col-marks">Marks</th>
							<th className="col-percent">%</th>
							{showGrade ? <th className="col-grade">Grade</th> : null}
						</tr>
					</thead>
					<tbody>
						{students.map((s) => {
							const pct =
								s.total_max > 0
									? Math.round((s.total_awarded / s.total_max) * 100)
									: 0
							const grade = showGrade
								? computeGrade(
										s.total_awarded,
										s.total_max,
										s.grade_boundaries,
										s.grade_boundary_mode ?? "percent",
									)
								: null
							const key = s.submission_id ?? s.student_name ?? s.exam_paper_id
							return (
								<tr key={key}>
									<td>{s.student_name ?? "Unnamed student"}</td>
									<td className="col-marks">
										{s.total_awarded}/{s.total_max}
									</td>
									<td className={`col-percent ${pctClass(pct)}`}>{pct}%</td>
									{showGrade ? (
										<td className="col-grade">{grade ?? "—"}</td>
									) : null}
								</tr>
							)
						})}
					</tbody>
				</table>
			</div>
		</section>
	)
}
