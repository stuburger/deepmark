import { buttonVariants } from "@/components/ui/button-variants"
import { getJobScanPageUrls, getStudentPaperResult } from "@/lib/mark-actions"
import { AlertCircle, CheckCircle2, Circle, Loader2 } from "lucide-react"
// Loader2 is used by StageIcon (active state)
import Link from "next/link"
import { notFound } from "next/navigation"
import { ContinueMarkingClient } from "./continue-marking-client"
import { MarkScanTwoColumn } from "./mark-scan-two-column"
import { MarkingJobPoller, ReScanButton } from "./polling-client"
import { MarkingResultsClient } from "./results-client"

type Stage = {
	key: string
	label: string
	statuses: string[]
}

const PIPELINE_STAGES: Stage[] = [
	{
		key: "upload",
		label: "Pages uploaded",
		statuses: [
			"pending",
			"processing",
			"text_extracted",
			"grading",
			"ocr_complete",
		],
	},
	{
		key: "ocr",
		label: "Text extracted from scan",
		statuses: ["text_extracted", "grading", "ocr_complete"],
	},
	{
		key: "paper",
		label: "Exam paper selected",
		statuses: ["grading", "ocr_complete"],
	},
	{ key: "grading", label: "Answers marked", statuses: ["ocr_complete"] },
]

type StageStatus = "complete" | "active" | "pending"

function getStageStatus(stage: Stage, currentStatus: string): StageStatus {
	if (stage.statuses.includes(currentStatus)) return "complete"
	const activeStatuses: Record<string, string[]> = {
		upload: [],
		ocr: ["pending", "processing"],
		paper: [],
		grading: ["grading"],
	}
	if (activeStatuses[stage.key]?.includes(currentStatus)) return "active"
	return "pending"
}

function StageIcon({ status }: { status: StageStatus }) {
	if (status === "complete")
		return <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
	if (status === "active")
		return <Loader2 className="h-5 w-5 text-primary animate-spin shrink-0" />
	return <Circle className="h-5 w-5 text-muted-foreground/40 shrink-0" />
}

function PipelineProgress({ status }: { status: string }) {
	return (
		<div className="rounded-xl border bg-card px-4 py-3 space-y-3">
			<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
				Progress
			</p>
			<div className="space-y-2.5">
				{PIPELINE_STAGES.map((stage) => {
					const stageStatus = getStageStatus(stage, status)
					return (
						<div key={stage.key} className="flex items-center gap-3">
							<StageIcon status={stageStatus} />
							<span
								className={`text-sm ${
									stageStatus === "complete"
										? "text-foreground"
										: stageStatus === "active"
											? "text-foreground font-medium"
											: "text-muted-foreground"
								}`}
							>
								{stage.label}
							</span>
						</div>
					)
				})}
			</div>
		</div>
	)
}

export default async function MarkResultPage({
	params,
}: {
	params: Promise<{ jobId: string }>
}) {
	const { jobId } = await params

	// Fetch job data and scan URLs in parallel
	const [result, scanResult] = await Promise.all([
		getStudentPaperResult(jobId),
		getJobScanPageUrls(jobId),
	])

	if (!result.ok) notFound()

	const data = result.data
	const scanPages = scanResult.ok ? scanResult.pages : []

	if (data.status === "ocr_complete") {
		return (
			<MarkingResultsClient jobId={jobId} data={data} scanPages={scanPages} />
		)
	}

	// text_extracted: OCR done, paper not yet selected — let user continue
	if (data.status === "text_extracted") {
		return (
			<MarkScanTwoColumn scanPages={scanPages}>
				<div>
					<p className="text-sm text-muted-foreground mb-1">
						<Link
							href="/teacher/mark"
							className="hover:underline underline-offset-4"
						>
							← Mark history
						</Link>
					</p>
					<h1 className="text-2xl font-semibold">Select exam paper</h1>
					<p className="text-sm text-muted-foreground mt-1">
						The scan was processed. Pick the paper to mark it against.
					</p>
				</div>
				<PipelineProgress status={data.status} />
				<ContinueMarkingClient
					jobId={jobId}
					extractedAnswers={data.extracted_answers ?? []}
					studentName={data.student_name}
					detectedSubject={data.detected_subject}
				/>
				{data.pages_count > 0 && <ReScanButton jobId={jobId} />}
			</MarkScanTwoColumn>
		)
	}

	// failed state
	if (data.status === "failed") {
		return (
			<MarkScanTwoColumn scanPages={scanPages}>
				<div>
					<p className="text-sm text-muted-foreground mb-1">
						<Link
							href="/teacher/mark"
							className="hover:underline underline-offset-4"
						>
							← Mark history
						</Link>
					</p>
					<h1 className="text-2xl font-semibold">Processing failed</h1>
				</div>

				<PipelineProgress status={data.status} />

				<div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-4 space-y-2">
					<div className="flex items-center gap-2">
						<AlertCircle className="h-4 w-4 text-destructive shrink-0" />
						<p className="text-sm font-medium text-destructive">Error</p>
					</div>
					<p className="text-sm text-destructive/80 pl-6">
						{data.error ?? "An unknown error occurred."}
					</p>
				</div>

				{data.extracted_answers && data.extracted_answers.length > 0 && (
					<div className="rounded-xl border bg-card">
						<div className="px-4 py-3 border-b flex items-center gap-2">
							<CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
							<p className="text-sm font-medium">
								Answers were extracted before failure (
								{data.extracted_answers.length} questions)
							</p>
						</div>
						<div className="divide-y">
							{data.extracted_answers.map((a) => (
								<div key={a.question_number} className="px-4 py-3 space-y-1">
									<p className="text-xs font-mono text-muted-foreground">
										Q{a.question_number}
									</p>
									<p className="text-sm whitespace-pre-wrap">
										{a.answer_text || (
											<span className="italic text-muted-foreground">
												No answer
											</span>
										)}
									</p>
								</div>
							))}
						</div>
					</div>
				)}

				<div className="flex flex-col items-start gap-2">
					{data.extracted_answers &&
						data.extracted_answers.length > 0 &&
						!data.exam_paper_id && (
							<ContinueMarkingClient
								jobId={jobId}
								extractedAnswers={data.extracted_answers}
								studentName={data.student_name}
								detectedSubject={data.detected_subject}
							/>
						)}
					{(!data.extracted_answers || data.extracted_answers.length === 0) && (
						<Link href="/teacher/mark/new" className={buttonVariants()}>
							Start over — mark a new paper
						</Link>
					)}
					{data.pages_count > 0 && <ReScanButton jobId={jobId} />}
				</div>
			</MarkScanTwoColumn>
		)
	}

	// cancelled
	if (data.status === "cancelled") {
		return (
			<MarkScanTwoColumn scanPages={scanPages}>
				<p className="text-sm text-muted-foreground">
					<Link
						href="/teacher/mark"
						className="hover:underline underline-offset-4"
					>
						← Mark history
					</Link>
				</p>
				<h1 className="text-2xl font-semibold">Cancelled</h1>
				<p className="text-sm text-muted-foreground">
					This marking job was cancelled.
				</p>
				<Link href="/teacher/mark/new" className={buttonVariants()}>
					Mark a new paper
				</Link>
			</MarkScanTwoColumn>
		)
	}

	// All other in-progress states: pending, processing, extracting, extracted, grading
	return (
		<MarkScanTwoColumn scanPages={scanPages}>
			<div>
				<p className="text-sm text-muted-foreground mb-1">
					<Link
						href="/teacher/mark"
						className="hover:underline underline-offset-4"
					>
						← Mark history
					</Link>
				</p>
				<h1 className="text-2xl font-semibold">
					{data.student_name ?? "Unknown student"}
				</h1>
				{data.exam_paper_title && (
					<p className="text-sm text-muted-foreground mt-0.5">
						{data.exam_paper_title}
					</p>
				)}
			</div>

			<PipelineProgress status={data.status} />

			<MarkingJobPoller jobId={jobId} initialStatus={data.status} />

			{data.extracted_answers && data.extracted_answers.length > 0 && (
				<div className="rounded-xl border bg-card">
					<div className="px-4 py-3 border-b flex items-center gap-2">
						<CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
						<p className="text-sm font-medium">
							Extracted answers ({data.extracted_answers.length} questions)
						</p>
					</div>
					<div className="divide-y">
						{data.extracted_answers.map((a) => (
							<div key={a.question_number} className="px-4 py-3 space-y-1">
								<p className="text-xs font-mono text-muted-foreground">
									Q{a.question_number}
								</p>
								<p className="text-sm whitespace-pre-wrap">
									{a.answer_text || (
										<span className="italic text-muted-foreground">
											No answer
										</span>
									)}
								</p>
							</div>
						))}
					</div>
				</div>
			)}

			<div className="flex items-center gap-3">
				<Link
					href="/teacher/mark"
					className={buttonVariants({ variant: "outline" })}
				>
					← Back to history
				</Link>
				{data.pages_count > 0 && <ReScanButton jobId={jobId} />}
			</div>
		</MarkScanTwoColumn>
	)
}
