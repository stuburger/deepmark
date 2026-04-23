import { computeGrade } from "@mcp-gcse/shared"
import { Page, Text, View } from "@react-pdf/renderer"
import type {
	PageToken,
	StudentPaperAnnotation,
	StudentPaperResultPayload,
} from "../types"
import { AnnotatedAnswer, marksForQuestion } from "./annotated-answer"
import { colors, styles } from "./styles"

function scoreColour(pct: number): string {
	if (pct >= 70) return colors.good
	if (pct >= 40) return colors.warn
	return colors.bad
}

function McqTable({
	results,
}: {
	results: StudentPaperResultPayload["grading_results"]
}) {
	if (results.length === 0) return null
	const totalAwarded = results.reduce((s, r) => s + r.awarded_score, 0)
	const totalMax = results.reduce((s, r) => s + r.max_score, 0)

	return (
		<View style={styles.questionCard} wrap={false}>
			<Text style={styles.h3}>Multiple choice questions</Text>
			<View style={styles.mcqHeader}>
				<Text style={styles.mcqColQ}>Q</Text>
				<Text style={styles.mcqColCorrect}>Correct</Text>
				<Text style={styles.mcqColStudent}>Student</Text>
				<Text style={styles.mcqColMark}>Mark</Text>
			</View>
			{results.map((r) => {
				const correct = r.correct_option_labels?.[0] ?? "-"
				const student = r.student_answer?.trim() || "-"
				const isCorrect = r.awarded_score > 0
				return (
					<View key={r.question_id} style={styles.mcqRow}>
						<Text style={styles.mcqColQ}>Q{r.question_number}</Text>
						<Text style={styles.mcqColCorrect}>{correct}</Text>
						<Text style={styles.mcqColStudent}>{student}</Text>
						<Text
							style={[
								styles.mcqColMark,
								{ color: isCorrect ? colors.good : colors.bad },
							]}
						>
							{r.awarded_score}/{r.max_score}
						</Text>
					</View>
				)
			})}
			<View style={[styles.mcqRow, { borderBottomWidth: 0 }]}>
				<Text style={[styles.mcqColQ, { fontFamily: "Helvetica-Bold" }]}>
					Total
				</Text>
				<Text style={styles.mcqColCorrect} />
				<Text style={styles.mcqColStudent} />
				<Text style={[styles.mcqColMark, { fontFamily: "Helvetica-Bold" }]}>
					{totalAwarded}/{totalMax}
				</Text>
			</View>
		</View>
	)
}

function WrittenQuestionCard({
	result,
	annotations,
	pageTokens,
}: {
	result: StudentPaperResultPayload["grading_results"][number]
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
		<View style={styles.questionCard} wrap={false}>
			<View style={styles.questionHeader}>
				<Text style={styles.questionNumber}>Q{result.question_number}</Text>
				<Text style={[styles.questionScore, { color: scoreColour(pct) }]}>
					{result.awarded_score}/{result.max_score}
					{levelTag}
				</Text>
			</View>
			{result.stimuli && result.stimuli.length > 0
				? result.stimuli.map((s) => (
						<View key={s.label} style={styles.stimulusBox}>
							<Text style={styles.stimulusLabel}>{s.label}</Text>
							<Text style={styles.stimulusContent}>{s.content}</Text>
						</View>
					))
				: null}
			<Text style={styles.questionText}>{result.question_text}</Text>

			{marks.length > 0 ? (
				<AnnotatedAnswer answerText={answerText} marks={marks} />
			) : (
				<View style={styles.answerBox}>
					<Text style={styles.answerText}>{answerText}</Text>
				</View>
			)}

			{result.what_went_well && result.what_went_well.length > 0 ? (
				<>
					<Text style={[styles.bulletHeading, { color: colors.good }]}>
						What went well
					</Text>
					{result.what_went_well.map((b, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: feedback bullets
						<Text key={`ww-${i}`} style={styles.bullet}>
							• {b}
						</Text>
					))}
				</>
			) : null}

			{result.even_better_if && result.even_better_if.length > 0 ? (
				<>
					<Text style={[styles.bulletHeading, { color: colors.warn }]}>
						Even better if
					</Text>
					{result.even_better_if.map((b, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: feedback bullets
						<Text key={`ebi-${i}`} style={styles.bullet}>
							• {b}
						</Text>
					))}
				</>
			) : null}
		</View>
	)
}

export function StudentSection({
	student,
	studentIndex,
	studentTotal,
	annotations = [],
	pageTokens = [],
}: {
	student: StudentPaperResultPayload
	studentIndex: number
	studentTotal: number
	annotations?: StudentPaperAnnotation[]
	pageTokens?: PageToken[]
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
	const footerLabel =
		studentTotal > 1
			? `${studentName} — ${studentIndex + 1} of ${studentTotal}`
			: studentName

	return (
		<Page size="A4" style={styles.page}>
			<View style={styles.spaceBetween}>
				<View>
					<Text style={styles.h1}>{studentName}</Text>
					<Text style={styles.smallMuted}>{student.exam_paper_title}</Text>
				</View>
				<View style={{ alignItems: "flex-end" }}>
					<Text
						style={[styles.h2, { color: scoreColour(pct), marginBottom: 0 }]}
					>
						{student.total_awarded}/{student.total_max} ({pct}%)
					</Text>
					{grade ? <Text style={styles.smallMuted}>Grade {grade}</Text> : null}
				</View>
			</View>

			{student.examiner_summary ? (
				<View style={{ marginTop: 10 }}>
					<Text style={styles.h3}>Examiner summary</Text>
					<Text style={{ fontSize: 9, color: colors.muted }}>
						{student.examiner_summary}
					</Text>
				</View>
			) : null}

			<View style={styles.rule} />

			<McqTable results={mcqResults} />

			{writtenResults.map((r) => (
				<WrittenQuestionCard
					key={r.question_id}
					result={r}
					annotations={annotations}
					pageTokens={pageTokens}
				/>
			))}

			<View style={styles.footer} fixed>
				<Text>DeepMark</Text>
				<Text>{footerLabel}</Text>
				<Text
					render={({ pageNumber, totalPages }) =>
						`Page ${pageNumber} of ${totalPages}`
					}
				/>
			</View>
		</Page>
	)
}
