"use client"

import { Button } from "@/components/ui/button"
import { exportSubmissionsForPaper } from "@/lib/marking/listing/export"
import type { SubmissionExportPayload } from "@/lib/marking/listing/export"
import { computeGrade } from "@mcp-gcse/shared"
import { useMutation } from "@tanstack/react-query"
import { Download, Loader2 } from "lucide-react"
import { toast } from "sonner"

function csvCell(value: string | number | null | undefined): string {
	if (value === null || value === undefined) return ""
	const s = String(value)
	if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
	return s
}

function formatDate(d: Date): string {
	const iso = new Date(d).toISOString()
	return iso.slice(0, 16).replace("T", " ")
}

function buildCsv(data: SubmissionExportPayload): string {
	const showGrade = data.grade_boundaries !== null

	const header: string[] = ["Student Name", "Marks", "Max", "%"]
	if (showGrade) header.push("Grade")
	header.push("Date marked", "Rescans")
	for (const q of data.questions) {
		header.push(`Q${q.question_number} (${q.max_score})`)
	}

	const lines = [header.map(csvCell).join(",")]
	for (const row of data.rows) {
		const pct =
			row.total_max > 0
				? Math.round((row.total_awarded / row.total_max) * 100)
				: 0
		const cells: (string | number | null)[] = [
			row.student_name ?? "",
			row.total_awarded,
			row.total_max,
			pct,
		]
		if (showGrade) {
			const grade = computeGrade(
				row.total_awarded,
				row.total_max,
				data.grade_boundaries,
			)
			cells.push(grade ?? "")
		}
		cells.push(formatDate(row.date_marked), row.rescans)
		for (const q of data.questions) {
			cells.push(row.per_question[q.question_id])
		}
		lines.push(cells.map(csvCell).join(","))
	}

	// UTF-8 BOM + CRLF for Excel compatibility.
	return `﻿${lines.join("\r\n")}\r\n`
}

function slugify(s: string): string {
	return s
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 60)
}

function triggerDownload(csv: string, filename: string) {
	const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
	const url = URL.createObjectURL(blob)
	const link = document.createElement("a")
	link.href = url
	link.download = filename
	document.body.appendChild(link)
	link.click()
	document.body.removeChild(link)
	URL.revokeObjectURL(url)
}

export function ExportSubmissionsButton({ paperId }: { paperId: string }) {
	const mutation = useMutation({
		mutationFn: () => exportSubmissionsForPaper(paperId),
		onSuccess: (result) => {
			if (!result.ok) {
				toast.error(result.error)
				return
			}
			if (result.data.rows.length === 0) {
				toast.error("No marked submissions to export")
				return
			}
			const csv = buildCsv(result.data)
			const date = new Date().toISOString().slice(0, 10)
			const filename = `submissions-${slugify(result.data.paper_title)}-${date}.csv`
			triggerDownload(csv, filename)
			toast.success(`Exported ${result.data.rows.length} submissions`)
		},
		onError: () => toast.error("Failed to export submissions"),
	})

	return (
		<Button
			variant="outline"
			size="sm"
			onClick={() => mutation.mutate()}
			disabled={mutation.isPending}
			title="Export marked submissions as CSV"
		>
			{mutation.isPending ? (
				<Loader2 className="h-3.5 w-3.5 animate-spin" />
			) : (
				<Download className="h-3.5 w-3.5" />
			)}
			Export CSV
		</Button>
	)
}
