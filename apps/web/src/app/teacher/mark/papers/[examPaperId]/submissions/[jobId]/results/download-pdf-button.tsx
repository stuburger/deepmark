"use client"

import { Button } from "@/components/ui/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { exportClassReport } from "@/lib/marking/pdf-export/export-action"
import type {
	PageToken,
	StudentPaperAnnotation,
	StudentPaperResultPayload,
} from "@/lib/marking/types"
import { ChevronDown, Download, FileText, Loader2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

/**
 * Single-submission export button. Rides on the same `exportClassReport`
 * server action as the class-level export (passing one submissionId is
 * the canonical "single student" form) so we have one rendering pipeline
 * to maintain.
 *
 * `annotations` + `pageTokens` are passed in only so the dropdown can
 * gate the "Export with Annotations" item — the action re-fetches them
 * itself from the resolved paper/submission ids.
 */
export function DownloadPdfButton({
	data,
	annotations,
	pageTokens,
}: {
	data: StudentPaperResultPayload
	annotations?: StudentPaperAnnotation[]
	pageTokens?: PageToken[]
}) {
	const [generating, setGenerating] = useState(false)
	const hasAnnotations =
		!!annotations &&
		annotations.length > 0 &&
		!!pageTokens &&
		pageTokens.length > 0

	async function handleDownload(includeAnnotations: boolean) {
		const submissionId = data.submission_id
		if (!submissionId) {
			toast.error("Submission missing — cannot generate PDF")
			return
		}
		setGenerating(true)
		try {
			const result = await exportClassReport({
				paperId: data.exam_paper_id,
				submissionIds: [submissionId],
				className: "",
				teacherName: "",
				printLayout: "none",
				includeAnnotations,
			})
			if (result?.serverError) {
				toast.error(result.serverError)
				return
			}
			const payload = result?.data
			if (!payload) {
				toast.error("Failed to generate PDF")
				return
			}
			// Click a hidden anchor — same pattern as the class export menu
			// so the user stays on the results page.
			const link = document.createElement("a")
			link.href = payload.url
			link.download = payload.filename
			document.body.appendChild(link)
			link.click()
			document.body.removeChild(link)
		} catch {
			toast.error("Failed to generate PDF")
		} finally {
			setGenerating(false)
		}
	}

	if (generating) {
		return (
			<Button variant="outline" size="sm" disabled>
				<Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
				Generating...
			</Button>
		)
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button variant="outline" size="sm">
						<Download className="h-3.5 w-3.5 mr-2" />
						Export PDF
						<ChevronDown className="h-3 w-3 ml-1" />
					</Button>
				}
			/>
			<DropdownMenuContent align="end">
				<DropdownMenuItem onClick={() => void handleDownload(false)}>
					<FileText className="h-3.5 w-3.5 mr-2" />
					Export PDF
				</DropdownMenuItem>
				{hasAnnotations && (
					<DropdownMenuItem onClick={() => void handleDownload(true)}>
						<FileText className="h-3.5 w-3.5 mr-2" />
						Export with Annotations
					</DropdownMenuItem>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	)
}
