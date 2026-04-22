import { computeGrade } from "@mcp-gcse/shared"
import { Page, Text, View } from "@react-pdf/renderer"
import type { StudentPaperResultPayload } from "../types"
import { colors, styles } from "./styles"
import type { ClassExportMeta } from "./types"

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

export function CoverPage({
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
		<Page size="A4" style={styles.page}>
			<View>
				<Text style={styles.h1}>Class report</Text>
				<Text style={styles.smallMuted}>{meta.paperTitle}</Text>

				<View style={styles.metaLine}>
					{meta.className ? <Text>Class: {meta.className}</Text> : null}
					{meta.teacherName ? <Text>Teacher: {meta.teacherName}</Text> : null}
					<Text>Generated {formatDate(meta.generatedAt)}</Text>
				</View>

				<View style={styles.metaLine}>
					<Text>
						{students.length} submission{students.length !== 1 ? "s" : ""}
					</Text>
					<Text>Class average: {avg}%</Text>
				</View>
			</View>

			<View style={{ marginTop: 20 }}>
				<Text style={styles.h3}>Summary</Text>
				<View style={styles.tableHeader}>
					<Text style={styles.colStudent}>Student</Text>
					<Text style={styles.colMarks}>Marks</Text>
					<Text style={styles.colPercent}>%</Text>
					{showGrade ? <Text style={styles.colGrade}>Grade</Text> : null}
				</View>

				{students.map((s) => {
					const pct =
						s.total_max > 0
							? Math.round((s.total_awarded / s.total_max) * 100)
							: 0
					const pctColor =
						pct >= 70 ? colors.good : pct >= 40 ? colors.warn : colors.bad
					const grade = showGrade
						? computeGrade(
								s.total_awarded,
								s.total_max,
								s.grade_boundaries,
								s.grade_boundary_mode ?? "percent",
							)
						: null
					return (
						<View
							key={s.submission_id ?? s.student_name ?? s.exam_paper_id}
							style={styles.tableRow}
						>
							<Text style={styles.colStudent}>
								{s.student_name ?? "Unnamed student"}
							</Text>
							<Text style={styles.colMarks}>
								{s.total_awarded}/{s.total_max}
							</Text>
							<Text style={[styles.colPercent, { color: pctColor }]}>
								{pct}%
							</Text>
							{showGrade ? (
								<Text style={styles.colGrade}>{grade ?? "—"}</Text>
							) : null}
						</View>
					)
				})}
			</View>

			<View style={styles.footer}>
				<Text>DeepMark</Text>
				<Text>Cover</Text>
			</View>
		</Page>
	)
}
