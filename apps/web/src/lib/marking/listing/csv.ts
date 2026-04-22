import { computeGrade } from "@mcp-gcse/shared"
import type { SubmissionExportPayload } from "./export"

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

export function buildCsv(data: SubmissionExportPayload): string {
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
				data.grade_boundary_mode ?? "percent",
			)
			cells.push(grade ?? "")
		}
		cells.push(formatDate(row.date_marked), row.rescans)
		for (const q of data.questions) {
			cells.push(row.per_question[q.question_id])
		}
		lines.push(cells.map(csvCell).join(","))
	}

	return `﻿${lines.join("\r\n")}\r\n`
}

export function slugify(s: string): string {
	return s
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 60)
}

export function triggerBlobDownload(
	content: Blob | string,
	filename: string,
	mimeType = "text/csv;charset=utf-8;",
) {
	const blob =
		content instanceof Blob ? content : new Blob([content], { type: mimeType })
	const url = URL.createObjectURL(blob)
	const link = document.createElement("a")
	link.href = url
	link.download = filename
	document.body.appendChild(link)
	link.click()
	document.body.removeChild(link)
	URL.revokeObjectURL(url)
}
