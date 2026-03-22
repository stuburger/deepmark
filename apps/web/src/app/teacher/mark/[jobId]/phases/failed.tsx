import { buttonVariants } from "@/components/ui/button-variants"
import type { StudentPaperJobPayload } from "@/lib/mark-actions"
import { AlertCircle, CheckCircle2 } from "lucide-react"
import Link from "next/link"
import { ExamPaperSelector } from "./exam-paper-selector"

/**
 * Shown when the job has failed.
 * If answers were recovered before the failure, offers a recovery path
 * so the teacher can still mark against a paper without re-uploading.
 */
export function FailedPanel({
	data,
	jobId,
}: {
	data: StudentPaperJobPayload
	jobId: string
}) {
	const hasRecoverableAnswers =
		data.extracted_answers &&
		data.extracted_answers.length > 0 &&
		!data.exam_paper_id

	if (hasRecoverableAnswers) {
		return (
			<div className="space-y-4">
				<div className="rounded-xl border border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/40 dark:bg-emerald-950/20 px-5 py-4 flex items-start gap-3">
					<div className="rounded-full bg-emerald-100 dark:bg-emerald-900/40 p-2 shrink-0 mt-0.5">
						<CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
					</div>
					<div>
						<p className="font-semibold text-sm">
							{data.extracted_answers!.length} answers were recovered
						</p>
						<p className="text-sm text-muted-foreground mt-0.5">
							Processing failed partway through, but the student&apos;s work was
							saved. Select an exam paper to finish marking.
						</p>
					</div>
				</div>

				<ExamPaperSelector
					jobId={jobId}
					extractedAnswers={data.extracted_answers!}
					studentName={data.student_name}
					detectedSubject={data.detected_subject}
				/>

				<div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 flex items-start gap-2">
					<AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
					<p className="text-xs text-destructive/80">
						{data.error ?? "An unknown error occurred during processing."}
					</p>
				</div>
			</div>
		)
	}

	return (
		<div className="rounded-xl border border-destructive/30 bg-destructive/5 px-5 py-5 space-y-4">
			<div className="flex items-start gap-3">
				<div className="rounded-full bg-destructive/10 p-2 shrink-0">
					<AlertCircle className="h-5 w-5 text-destructive" />
				</div>
				<div>
					<p className="font-semibold text-destructive">Processing failed</p>
					<p className="text-sm text-destructive/80 mt-1">
						{data.error ?? "An unknown error occurred."}
					</p>
				</div>
			</div>
			<Link
				href="/teacher/mark/new"
				className={buttonVariants({ className: "w-full justify-center" })}
			>
				Start over — mark a new paper
			</Link>
		</div>
	)
}
