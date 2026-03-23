"use client"

import { buttonVariants } from "@/components/ui/button-variants"
import {
	Dialog,
	DialogContent,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog"
import type { ExtractedAnswer } from "@/lib/mark-actions"
import { CheckCircle2, FileText, UserPlus } from "lucide-react"
import { useState } from "react"
import { ExamPaperSelector } from "./exam-paper-selector"
import { StudentLinker } from "./student-linker"

/**
 * Compact setup panel shown in the Digital tab during the paper_setup phase.
 * Each setup action opens as a dialog so the scan view stays uninterrupted.
 *
 * Step 1 — Link student (skippable)
 * Step 2 — Select exam paper
 */
export function PaperSetupWizard({
	jobId,
	studentLinked,
	detectedStudentName,
	examPaperPreselected,
	extractedAnswers,
	detectedSubject,
}: {
	jobId: string
	studentLinked: boolean
	detectedStudentName: string | null
	examPaperPreselected: boolean
	extractedAnswers: ExtractedAnswer[]
	detectedSubject: string | null
}) {
	const [skippedStudent, setSkippedStudent] = useState(false)

	const showStudentStep = !studentLinked && !skippedStudent
	const studentResolved = studentLinked || skippedStudent

	return (
		<div className="space-y-3">
			{/* Answers summary */}
			{extractedAnswers.length > 0 && (
				<div className="flex items-center gap-2 rounded-xl border bg-card px-4 py-3">
					<CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
					<p className="text-sm font-medium">
						{extractedAnswers.length} answer
						{extractedAnswers.length !== 1 ? "s" : ""} extracted from scan
					</p>
				</div>
			)}

			{/* Step 1: Link student */}
			{showStudentStep && (
				<div className="flex items-center justify-between gap-4 rounded-xl border bg-card px-4 py-3">
					<div>
						<p className="text-sm font-medium">Who is this paper for?</p>
						<p className="text-xs text-muted-foreground mt-0.5">
							Link to a student record, or skip to mark anonymously
						</p>
					</div>
					<Dialog>
						<DialogTrigger className={buttonVariants({ size: "sm" })}>
							<UserPlus className="h-3.5 w-3.5 mr-1.5" />
							Link student
						</DialogTrigger>
						<DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
							<DialogTitle className="sr-only">Link student</DialogTitle>
							<StudentLinker
								jobId={jobId}
								detectedStudentName={detectedStudentName}
								onSkip={() => setSkippedStudent(true)}
							/>
						</DialogContent>
					</Dialog>
				</div>
			)}

			{/* Step 2: Select exam paper */}
			{studentResolved && !examPaperPreselected && (
				<div className="flex items-center justify-between gap-4 rounded-xl border bg-card px-4 py-3">
					<div>
						<p className="text-sm font-medium">Select exam paper</p>
						<p className="text-xs text-muted-foreground mt-0.5">
							Pick the paper to mark this work against
						</p>
					</div>
					<Dialog>
						<DialogTrigger className={buttonVariants({ size: "sm" })}>
							<FileText className="h-3.5 w-3.5 mr-1.5" />
							Select paper
						</DialogTrigger>
						<DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
							<DialogTitle className="sr-only">Select exam paper</DialogTitle>
							<ExamPaperSelector
								jobId={jobId}
								extractedAnswers={extractedAnswers}
								studentName={detectedStudentName}
								detectedSubject={detectedSubject}
							/>
						</DialogContent>
					</Dialog>
				</div>
			)}
		</div>
	)
}
