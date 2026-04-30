"use client"

import {
	ClassExportDialog,
	type ClassExportFormValues,
	EMPTY_CLASS_EXPORT,
} from "@/components/marking/class-export-dialog"
import { Button } from "@/components/ui/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
	buildCsv,
	slugify,
	triggerBlobDownload,
} from "@/lib/marking/listing/csv"
import { exportSubmissionsForPaper } from "@/lib/marking/listing/export"
import { exportClassReport } from "@/lib/marking/pdf-export/export-action"
import type { SubmissionHistoryItem } from "@/lib/marking/types"
import { useMutation } from "@tanstack/react-query"
import { ChevronDown, Download, FileText, Loader2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

type Scope = "all" | "selected"

function selectableSubmissions(
	submissions: SubmissionHistoryItem[],
): SubmissionHistoryItem[] {
	return submissions.filter((s) => s.status === "ocr_complete")
}

function effectiveIds(
	submissions: SubmissionHistoryItem[],
	scope: Scope,
	selectedIds: Set<string>,
): string[] {
	if (scope === "selected") {
		return Array.from(selectedIds).filter((id) =>
			selectableSubmissions(submissions).some((s) => s.id === id),
		)
	}
	return selectableSubmissions(submissions).map((s) => s.id)
}

export function ExportMenu({
	paperId,
	submissions,
	selectedIds,
}: {
	paperId: string
	submissions: SubmissionHistoryItem[]
	selectedIds: Set<string>
}) {
	const [pdfDialogOpen, setPdfDialogOpen] = useState(false)
	const [pdfScope, setPdfScope] = useState<Scope>("all")

	const markedCount = selectableSubmissions(submissions).length
	const selectedMarkedCount = effectiveIds(
		submissions,
		"selected",
		selectedIds,
	).length

	// ── CSV mutation ────────────────────────────────────────────────────────
	const csvMutation = useMutation({
		mutationFn: async (scope: Scope) => {
			const ids = effectiveIds(submissions, scope, selectedIds)
			if (ids.length === 0) {
				const error =
					scope === "selected"
						? "No marked submissions selected"
						: "No marked submissions to export"
				return { serverError: error, data: undefined } as const
			}
			return exportSubmissionsForPaper({
				examPaperId: paperId,
				submissionIds: scope === "selected" ? ids : undefined,
			})
		},
		onSuccess: (result) => {
			if (result?.serverError) {
				toast.error(result.serverError)
				return
			}
			const data = result?.data?.data
			if (!data) {
				toast.error("Failed to export submissions")
				return
			}
			if (data.rows.length === 0) {
				toast.error("No marked submissions to export")
				return
			}
			const csv = buildCsv(data)
			const date = new Date().toISOString().slice(0, 10)
			const filename = `submissions-${slugify(data.paper_title)}-${date}.csv`
			triggerBlobDownload(csv, filename)
			toast.success(`Exported ${data.rows.length} submissions`)
		},
		onError: () => toast.error("Failed to export submissions"),
	})

	// ── PDF mutation (fires after dialog submit) ────────────────────────────
	const pdfMutation = useMutation({
		mutationFn: async ({
			scope,
			values,
		}: {
			scope: Scope
			values: ClassExportFormValues
		}) => {
			const ids = effectiveIds(submissions, scope, selectedIds)
			if (ids.length === 0) {
				return {
					serverError: "No marked submissions to export",
					data: undefined,
					validationErrors: undefined,
				} as const
			}

			return exportClassReport({
				paperId,
				submissionIds: ids,
				className: values.className,
				teacherName: values.teacherName,
				printLayout: values.printLayout,
				includeAnnotations: values.includeAnnotations,
			})
		},
		onSuccess: (result) => {
			if (result?.serverError) {
				toast.error(result.serverError)
				return
			}
			if (result?.validationErrors) {
				const ve = result.validationErrors
				const issue =
					ve.formErrors?.[0] ?? Object.values(ve.fieldErrors).flat()[0]
				toast.error(issue ?? "Invalid input")
				return
			}
			const data = result?.data
			if (!data) {
				toast.error("Failed to export class report")
				return
			}
			// Trigger the download via an anchor click — keeps the user on the
			// page (window.location.href would navigate away momentarily).
			const link = document.createElement("a")
			link.href = data.url
			link.download = data.filename
			document.body.appendChild(link)
			link.click()
			document.body.removeChild(link)
			setPdfDialogOpen(false)
			toast.success(
				`Exported ${data.count} submission${data.count !== 1 ? "s" : ""}`,
			)
		},
		onError: () => toast.error("Failed to generate PDF"),
	})

	async function handlePdfSubmit(values: ClassExportFormValues) {
		await pdfMutation.mutateAsync({ scope: pdfScope, values })
	}

	function openPdfDialog(scope: Scope) {
		setPdfScope(scope)
		setPdfDialogOpen(true)
	}

	const csvPending = csvMutation.isPending
	const pdfPending = pdfMutation.isPending

	const dialogSubmissionCount = effectiveIds(
		submissions,
		pdfScope,
		selectedIds,
	).length

	return (
		<>
			<div className="flex items-center gap-2">
				<DropdownMenu>
					<DropdownMenuTrigger
						render={
							<Button variant="outline" size="sm" disabled={csvPending}>
								{csvPending ? (
									<Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
								) : (
									<Download className="h-3.5 w-3.5 mr-2" />
								)}
								Export CSV
								<ChevronDown className="h-3 w-3 ml-1" />
							</Button>
						}
					/>
					<DropdownMenuContent align="end">
						<DropdownMenuItem
							onClick={() => csvMutation.mutate("all")}
							disabled={markedCount === 0}
						>
							Everything ({markedCount})
						</DropdownMenuItem>
						<DropdownMenuItem
							onClick={() => csvMutation.mutate("selected")}
							disabled={selectedMarkedCount === 0}
						>
							Selected ({selectedMarkedCount})
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>

				<DropdownMenu>
					<DropdownMenuTrigger
						render={
							<Button variant="outline" size="sm" disabled={pdfPending}>
								{pdfPending ? (
									<Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
								) : (
									<FileText className="h-3.5 w-3.5 mr-2" />
								)}
								Export PDF
								<ChevronDown className="h-3 w-3 ml-1" />
							</Button>
						}
					/>
					<DropdownMenuContent align="end">
						<DropdownMenuItem
							onClick={() => openPdfDialog("all")}
							disabled={markedCount === 0}
						>
							Everything ({markedCount})
						</DropdownMenuItem>
						<DropdownMenuItem
							onClick={() => openPdfDialog("selected")}
							disabled={selectedMarkedCount === 0}
						>
							Selected ({selectedMarkedCount})
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			<ClassExportDialog
				open={pdfDialogOpen}
				onOpenChange={setPdfDialogOpen}
				submissionCount={dialogSubmissionCount}
				initialValue={EMPTY_CLASS_EXPORT}
				onSubmit={handlePdfSubmit}
				submitting={pdfPending}
			/>
		</>
	)
}
