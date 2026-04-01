"use client"

import { Button } from "@/components/ui/button"
import type { StudentPaperResultPayload } from "@/lib/marking/types"
import { Download, Loader2 } from "lucide-react"
import { useState } from "react"

export function DownloadPdfButton({
	data,
}: {
	data: StudentPaperResultPayload
}) {
	const [generating, setGenerating] = useState(false)

	async function handleDownload() {
		setGenerating(true)
		try {
			const { jsPDF } = await import("jspdf")

			const doc = new jsPDF({ unit: "mm", format: "a4" })
			const pageW = doc.internal.pageSize.getWidth()
			const pageH = doc.internal.pageSize.getHeight()
			const margin = 18
			const contentW = pageW - margin * 2
			let y = margin

			const studentName = data.student_name ?? "Unknown student"
			const paperTitle = data.exam_paper_title ?? ""
			const scorePercent =
				data.total_max > 0
					? Math.round((data.total_awarded / data.total_max) * 100)
					: 0

			function addText(
				text: string,
				opts: {
					size?: number
					style?: "normal" | "bold"
					colour?: [number, number, number]
					x?: number
					maxW?: number
					lineH?: number
				} = {},
			): number {
				const {
					size = 10,
					style = "normal",
					colour = [17, 24, 39],
					x = margin,
					maxW = contentW,
					lineH,
				} = opts
				doc.setFontSize(size)
				doc.setFont("helvetica", style)
				doc.setTextColor(...colour)
				const lines = doc.splitTextToSize(text, maxW)
				const lh = lineH ?? size * 0.45
				for (const line of lines) {
					if (y + lh > pageH - margin) {
						doc.addPage()
						y = margin
					}
					doc.text(line as string, x, y)
					y += lh
				}
				return y
			}

			function gap(mm: number) {
				y += mm
			}

			function hRule(colour: [number, number, number] = [229, 231, 235]) {
				doc.setDrawColor(...colour)
				doc.setLineWidth(0.3)
				doc.line(margin, y, pageW - margin, y)
				gap(4)
			}

			addText(studentName, { size: 16, style: "bold" })
			gap(1)
			if (paperTitle) addText(paperTitle, { size: 10, colour: [107, 114, 128] })
			gap(2)
			addText(
				`Total: ${data.total_awarded} / ${data.total_max}  (${scorePercent}%)`,
				{ size: 12, style: "bold" },
			)
			gap(3)
			hRule([17, 24, 39])

			for (const r of data.grading_results) {
				const pct =
					r.max_score > 0
						? Math.round((r.awarded_score / r.max_score) * 100)
						: 0
				const scoreColour: [number, number, number] =
					pct >= 70 ? [22, 163, 74] : pct >= 40 ? [202, 138, 4] : [220, 38, 38]

				addText(`Q${r.question_number}`, { size: 8, colour: [107, 114, 128] })
				gap(1)
				addText(r.question_text, { size: 10, style: "bold" })
				gap(2)

				const answerText = r.student_answer?.trim() || "(No answer written)"
				const answerLines = doc
					.setFontSize(9)
					.splitTextToSize(answerText, contentW - 8)
				const boxH = Math.max(8, answerLines.length * 4.5 + 5)
				if (y + boxH > pageH - margin) {
					doc.addPage()
					y = margin
				}
				doc.setFillColor(249, 250, 251)
				doc.setDrawColor(229, 231, 235)
				doc.setLineWidth(0.3)
				doc.roundedRect(margin, y, contentW, boxH, 2, 2, "FD")
				doc.setFontSize(9)
				doc.setFont("helvetica", "normal")
				doc.setTextColor(55, 65, 81)
				doc.text(answerLines as string[], margin + 4, y + 4.5)
				y += boxH + 6

				addText(`Score: ${r.awarded_score} / ${r.max_score}  (${pct}%)`, {
					size: 10,
					style: "bold",
					colour: scoreColour,
				})
				gap(1)

				if (r.feedback_summary) {
					addText(r.feedback_summary, { size: 9, colour: [55, 65, 81] })
				}

				gap(4)
				hRule()
			}

			gap(2)
			const date = new Date().toLocaleDateString("en-GB", {
				day: "2-digit",
				month: "long",
				year: "numeric",
			})
			addText(`Generated ${date}`, { size: 8, colour: [156, 163, 175] })

			const filename = `${studentName.replace(/\s+/g, "-")}-grading-report.pdf`
			doc.save(filename)
		} finally {
			setGenerating(false)
		}
	}

	return (
		<Button
			variant="outline"
			size="sm"
			disabled={generating}
			onClick={() => void handleDownload()}
		>
			{generating ? (
				<Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
			) : (
				<Download className="h-3.5 w-3.5 mr-2" />
			)}
			{generating ? "Generating…" : "Export PDF"}
		</Button>
	)
}
