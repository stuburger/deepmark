"use client"

import { buttonVariants } from "@/components/ui/button-variants"
import { Separator } from "@/components/ui/separator"
import type { ScanPageUrl, StudentPaperResultPayload } from "@/lib/mark-actions"
import { cn } from "@/lib/utils"
import { PlusCircle, ScanText } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { AnnotatedScanColumn } from "./annotated-scan-column"
import { DownloadPdfButton } from "./download-pdf-button"
import { GradingResultsPanel } from "./grading-results-panel"
import { ReMarkButton } from "./re-mark-button"
import { StudentNameEditor } from "./student-name-editor"

/**
 * Full-screen results view for the completed phase.
 * Sticky toolbar + scrollable annotated scan (left) + results sidebar (right).
 * Falls back to a single-column layout when there are no scan pages.
 */
export function MarkingResults({
	jobId,
	data,
	scanPages,
}: {
	jobId: string
	data: StudentPaperResultPayload
	scanPages: ScanPageUrl[]
}) {
	const [answers, setAnswers] = useState<Record<string, string>>(
		Object.fromEntries(
			data.grading_results.map((r) => [r.question_id, r.student_answer]),
		),
	)
	const [showHighlights, setShowHighlights] = useState(false)

	const hasScanPages = scanPages.length > 0

	// Single-column fallback when no scan pages are available
	if (!hasScanPages) {
		return (
			<div className="max-w-3xl space-y-6">
				<div className="flex items-start justify-between gap-4">
					<div>
						<p className="text-sm text-muted-foreground mb-1">
							<Link
								href="/teacher/mark"
								className="hover:underline underline-offset-4"
							>
								← Mark history
							</Link>
						</p>
						<StudentNameEditor jobId={jobId} initialName={data.student_name} />
						<p className="text-sm text-muted-foreground mt-0.5">
							{data.exam_paper_title}
						</p>
					</div>
					<div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
						<DownloadPdfButton data={data} />
						<ReMarkButton jobId={jobId} />
						<Link
							href="/teacher/mark/new"
							className={buttonVariants({ size: "sm" })}
						>
							<PlusCircle className="h-3.5 w-3.5 mr-1.5" />
							Mark another
						</Link>
					</div>
				</div>
				<GradingResultsPanel
					jobId={jobId}
					data={data}
					answers={answers}
					onAnswerSaved={(id, text) =>
						setAnswers((prev) => ({ ...prev, [id]: text }))
					}
				/>
			</div>
		)
	}

	// Full two-panel layout: sticky toolbar + scan left + results sidebar right
	return (
		<div className="-m-6 flex flex-col overflow-hidden h-dvh">
			{/* Sticky toolbar */}
			<div className="shrink-0 flex items-center gap-3 border-b bg-background px-4 py-2 flex-wrap">
				<Link
					href="/teacher/mark"
					className="text-sm text-muted-foreground hover:text-foreground hover:underline underline-offset-4 shrink-0"
				>
					← Mark history
				</Link>
				<Separator orientation="vertical" className="h-4 shrink-0" />
				<StudentNameEditor jobId={jobId} initialName={data.student_name} />
				{data.exam_paper_title && (
					<>
						<Separator orientation="vertical" className="h-4 shrink-0" />
						<p className="text-sm text-muted-foreground truncate max-w-xs">
							{data.exam_paper_title}
						</p>
					</>
				)}

				<div className="ml-auto flex items-center gap-2 shrink-0">
					<button
						type="button"
						onClick={() => setShowHighlights((v) => !v)}
						className={cn(
							buttonVariants({ variant: "outline", size: "sm" }),
							showHighlights &&
								"bg-primary text-primary-foreground border-primary hover:bg-primary/90 hover:text-primary-foreground",
						)}
					>
						<ScanText className="h-3.5 w-3.5 mr-2" />
						OCR overlay
					</button>
					<DownloadPdfButton data={data} />
					<ReMarkButton jobId={jobId} />
					<Link
						href="/teacher/mark/new"
						className={buttonVariants({ size: "sm" })}
					>
						<PlusCircle className="h-3.5 w-3.5 mr-1.5" />
						Mark another
					</Link>
				</div>
			</div>

			{/* Two-panel body */}
			<div className="flex flex-1 min-h-0">
				<div className="flex-1 overflow-y-auto bg-muted/20">
					<AnnotatedScanColumn
						pages={scanPages}
						showHighlights={showHighlights}
						gradingResults={data.grading_results}
					/>
				</div>
				<div className="w-96 shrink-0 border-l overflow-y-auto">
					<div className="p-4 space-y-5">
						<GradingResultsPanel
							jobId={jobId}
							data={data}
							answers={answers}
							onAnswerSaved={(id, text) =>
								setAnswers((prev) => ({ ...prev, [id]: text }))
							}
						/>
					</div>
				</div>
			</div>
		</div>
	)
}
