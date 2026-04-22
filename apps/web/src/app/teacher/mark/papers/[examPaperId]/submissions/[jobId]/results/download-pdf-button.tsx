"use client"

import { Button } from "@/components/ui/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { slugify, triggerBlobDownload } from "@/lib/marking/listing/csv"
import type {
	PageToken,
	StudentPaperAnnotation,
	StudentPaperResultPayload,
} from "@/lib/marking/types"
import { ChevronDown, Download, FileText, Loader2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

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
		annotations && annotations.length > 0 && pageTokens && pageTokens.length > 0

	async function handleDownload(includeAnnotations: boolean) {
		setGenerating(true)
		try {
			const { generateSingleStudentReport } = await import(
				"@/lib/marking/pdf-export/generate"
			)

			const bytes = await generateSingleStudentReport({
				student: data,
				annotations,
				pageTokens,
				includeAnnotations,
			})

			const studentName = data.student_name ?? "unknown-student"
			const suffix = includeAnnotations ? "-annotated" : ""
			const filename = `${slugify(studentName)}${suffix}-grading-report.pdf`

			const ab = bytes.buffer.slice(
				bytes.byteOffset,
				bytes.byteOffset + bytes.byteLength,
			) as ArrayBuffer
			const blob = new Blob([ab], { type: "application/pdf" })
			triggerBlobDownload(blob, filename, "application/pdf")
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
