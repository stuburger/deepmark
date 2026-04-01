import type { StudentPaperJobPayload } from "@/lib/marking/types"
import type { JobEvent } from "@mcp-gcse/db"
import { CheckCircle2, Circle, Loader2 } from "lucide-react"

type NodeState = "complete" | "active" | "pending"

function TimelineIcon({ state }: { state: NodeState }) {
	if (state === "complete")
		return <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
	if (state === "active")
		return (
			<Loader2 className="h-4 w-4 text-primary animate-spin shrink-0 mt-0.5" />
		)
	return <Circle className="h-4 w-4 text-muted-foreground/30 shrink-0 mt-0.5" />
}

function TimelineRow({
	state,
	label,
	detail,
	children,
}: {
	state: NodeState
	label: string
	detail?: string
	children?: React.ReactNode
}) {
	return (
		<div className="flex gap-3">
			<TimelineIcon state={state} />
			<div className="flex-1 min-w-0">
				<span
					className={`text-sm leading-tight ${
						state === "complete"
							? "text-foreground"
							: state === "active"
								? "text-foreground font-medium"
								: "text-muted-foreground"
					}`}
				>
					{label}
				</span>
				{detail && (
					<p className="text-xs text-muted-foreground mt-0.5">{detail}</p>
				)}
				{children}
			</div>
		</div>
	)
}

/** Event-driven pipeline progress timeline. Falls back gracefully for older jobs. */
export function JobTimeline({ data }: { data: StudentPaperJobPayload }) {
	const events = data.job_events ?? []

	const find = <T extends JobEvent["type"]>(type: T) =>
		events.find((e): e is Extract<JobEvent, { type: T }> => e.type === type)
	const count = <T extends JobEvent["type"]>(type: T) =>
		events.filter((e) => e.type === type).length

	const ocrStarted = find("ocr_started")
	const answersExtracted = find("answers_extracted")
	const ocrComplete = find("ocr_complete")
	const studentLinked = find("student_linked")
	const examPaperSelected = find("exam_paper_selected")
	const gradingStarted = find("grading_started")
	const regionStarted = find("region_attribution_started")
	const regionComplete = find("region_attribution_complete")
	const gradingComplete = find("grading_complete")
	const jobFailed = find("job_failed")
	const questionsGradedCount = count("question_graded")

	const ocrState: NodeState = ocrComplete
		? "complete"
		: ocrStarted
			? "active"
			: "pending"

	const gradingState: NodeState = gradingComplete
		? "complete"
		: gradingStarted
			? "active"
			: "pending"

	const regionState: NodeState = regionComplete
		? "complete"
		: regionStarted
			? "active"
			: "pending"

	const ocrDetail = ocrComplete
		? answersExtracted
			? `${answersExtracted.count} answers extracted${
					answersExtracted.student_name
						? ` · ${answersExtracted.student_name}`
						: ""
				}`
			: "Complete"
		: ocrStarted
			? "Reading pages…"
			: undefined

	const gradingDetail = gradingComplete
		? `${gradingComplete.total_awarded} / ${gradingComplete.total_max} marks`
		: gradingStarted
			? `${questionsGradedCount} / ${gradingStarted.questions_total} questions marked`
			: undefined

	return (
		<div className="rounded-xl border bg-card px-4 py-3 space-y-3">
			<div className="flex items-center justify-between">
				<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
					Progress
				</p>
				<span className="font-mono text-xs text-muted-foreground/60 bg-muted px-1.5 py-0.5 rounded">
					{data.status}
				</span>
			</div>

			<div className="space-y-2.5">
				<TimelineRow
					state="complete"
					label="Scan uploaded"
					detail={`${data.pages_count} page${
						data.pages_count !== 1 ? "s" : ""
					}`}
				/>

				<TimelineRow state={ocrState} label="Read pages" detail={ocrDetail} />

				{studentLinked && (
					<TimelineRow
						state="complete"
						label="Student linked"
						detail={studentLinked.student_name}
					/>
				)}

				{examPaperSelected && (
					<TimelineRow
						state="complete"
						label="Exam paper selected"
						detail={examPaperSelected.title}
					/>
				)}

				{gradingStarted && (
					<TimelineRow
						state={gradingState}
						label="Mark answers"
						detail={gradingDetail}
					>
						{regionStarted && (
							<div className="mt-1.5 ml-0.5 flex gap-2.5 items-start">
								<div className="mt-0.5 w-px h-3 bg-border shrink-0" />
								<TimelineRow
									state={regionState}
									label="Locate answers on scan"
									detail={
										regionComplete
											? `${regionComplete.questions_located} questions located`
											: "Running in parallel…"
									}
								/>
							</div>
						)}
					</TimelineRow>
				)}

				{jobFailed && (
					<TimelineRow
						state="complete"
						label={`Failed during ${jobFailed.phase}`}
						detail={jobFailed.error}
					/>
				)}
			</div>
		</div>
	)
}
