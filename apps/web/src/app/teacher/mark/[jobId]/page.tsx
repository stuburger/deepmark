import { buttonVariants } from "@/components/ui/button-variants"
import {
	type StudentPaperJobPayload,
	getJobScanPageUrls,
	getStudentPaperResult,
} from "@/lib/mark-actions"
import Link from "next/link"
import { notFound } from "next/navigation"
import { JobTimeline } from "./job-timeline"
import { MarkingWorkspace } from "./marking-workspace"
import { CancelledPanel } from "./phases/cancelled"
import { FailedPanel } from "./phases/failed"
import { MarkingInProgressPanel } from "./phases/marking-in-progress"
import { PaperSetupWizard } from "./phases/paper-setup"
import { MarkingResults } from "./phases/results/index"
import { ScanProcessingPanel } from "./phases/scan-processing"
import { derivePhase } from "./shared/phase"
import { ReScanButton } from "./shared/re-scan-button"

// ─── Heading ──────────────────────────────────────────────────────────────────

function deriveHeading(data: StudentPaperJobPayload): {
	title: string
	subtitle: string | null
} {
	if (data.status === "text_extracted") {
		if (!data.student_id)
			return {
				title: "Review scan",
				subtitle: "Link this paper to a student to continue.",
			}
		if (data.exam_paper_id)
			return { title: "Processing", subtitle: "Your paper is being marked." }
		return {
			title: "Select exam paper",
			subtitle: "Pick the exam paper to mark this work against.",
		}
	}
	if (data.status === "failed")
		return {
			title: data.student_name ?? "Processing failed",
			subtitle: data.exam_paper_title,
		}
	if (data.status === "cancelled") return { title: "Cancelled", subtitle: null }
	return {
		title: data.student_name ?? "Unknown student",
		subtitle: data.exam_paper_title,
	}
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function MarkResultPage({
	params,
}: {
	params: Promise<{ jobId: string }>
}) {
	const { jobId } = await params

	const [result, scanResult] = await Promise.all([
		getStudentPaperResult(jobId),
		getJobScanPageUrls(jobId),
	])

	if (!result.ok) notFound()

	const data = result.data
	const scanPages = scanResult.ok ? scanResult.pages : []
	const phase = derivePhase(data)

	// ── Completed phase: full-screen results with annotated scan ───────────────
	if (phase === "completed") {
		return <MarkingResults jobId={jobId} data={data} scanPages={scanPages} />
	}

	// ── All other phases: compact workspace with sticky scan sidebar ───────────
	const { title, subtitle } = deriveHeading(data)

	return (
		<MarkingWorkspace scanPages={scanPages}>
			{/* Header */}
			<div>
				<p className="text-sm text-muted-foreground mb-1">
					<Link
						href="/teacher/mark"
						className="hover:underline underline-offset-4"
					>
						← Mark history
					</Link>
				</p>
				<h1 className="text-2xl font-semibold">{title}</h1>
				{subtitle && (
					<p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
				)}
			</div>

			{/* Phase panel — the primary action */}
			{phase === "paper_setup" && (
				<PaperSetupWizard
					jobId={jobId}
					studentLinked={Boolean(data.student_id)}
					detectedStudentName={data.student_name}
					examPaperPreselected={Boolean(data.exam_paper_id)}
					extractedAnswers={data.extracted_answers ?? []}
					detectedSubject={data.detected_subject}
				/>
			)}
			{phase === "marking_in_progress" && (
				<MarkingInProgressPanel jobId={jobId} initialData={data} />
			)}
			{phase === "failed" && <FailedPanel data={data} jobId={jobId} />}
			{phase === "cancelled" && <CancelledPanel />}
			{phase === "scan_processing" && (
				<ScanProcessingPanel jobId={jobId} initialStatus={data.status} />
			)}

			{/* Pipeline progress — informational */}
			{phase !== "cancelled" && <JobTimeline data={data} />}

			{/* Footer */}
			<div className="flex items-center gap-3 flex-wrap">
				<Link
					href="/teacher/mark"
					className={buttonVariants({ variant: "outline" })}
				>
					← Back to history
				</Link>
				{data.pages_count > 0 && <ReScanButton jobId={jobId} />}
			</div>
		</MarkingWorkspace>
	)
}
