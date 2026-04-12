"use client"

import { Button } from "@/components/ui/button"
import type { StudentPaperResultPayload } from "@/lib/marking/types"
import { Download, Loader2 } from "lucide-react"
import { useState } from "react"

const INDIE_FLOWER_URL =
	"https://fonts.gstatic.com/s/indieflower/v21/m8JVjfNVeKWVnh3QMuKkFcZlbkGG1dKEDw.ttf"

async function loadFont(): Promise<string> {
	const res = await fetch(INDIE_FLOWER_URL)
	const buf = await res.arrayBuffer()
	const bytes = new Uint8Array(buf)
	let binary = ""
	for (const byte of bytes) binary += String.fromCharCode(byte)
	return btoa(binary)
}

async function loadLogo(): Promise<string> {
	const res = await fetch("/deepmark-logo-transparent.png")
	const blob = await res.blob()
	return new Promise((resolve) => {
		const reader = new FileReader()
		reader.onloadend = () => resolve(reader.result as string)
		reader.readAsDataURL(blob)
	})
}

export function DownloadPdfButton({
	data,
}: {
	data: StudentPaperResultPayload
}) {
	const [generating, setGenerating] = useState(false)

	async function handleDownload() {
		setGenerating(true)
		try {
			const [{ jsPDF }, fontBase64, logoDataUrl] = await Promise.all([
				import("jspdf"),
				loadFont(),
				loadLogo(),
			])

			const doc = new jsPDF({ unit: "mm", format: "a4" })
			const pageW = doc.internal.pageSize.getWidth()
			const pageH = doc.internal.pageSize.getHeight()
			const margin = 18
			const contentW = pageW - margin * 2
			let y = margin

			// Register Indie Flower font
			doc.addFileToVFS("IndieFlower-Regular.ttf", fontBase64)
			doc.addFont("IndieFlower-Regular.ttf", "IndieFlower", "normal")

			const studentName = data.student_name ?? "Unknown student"
			const paperTitle = data.exam_paper_title ?? ""
			const scorePercent =
				data.total_max > 0
					? Math.round((data.total_awarded / data.total_max) * 100)
					: 0

			// ── Helpers ─────────────────────────────────────────────────────

			function addText(
				text: string,
				opts: {
					size?: number
					style?: "normal" | "bold"
					font?: string
					colour?: [number, number, number]
					x?: number
					maxW?: number
					lineH?: number
				} = {},
			): number {
				const {
					size = 10,
					style = "normal",
					font = "helvetica",
					colour = [17, 24, 39],
					x = margin,
					maxW = contentW,
					lineH,
				} = opts
				doc.setFontSize(size)
				doc.setFont(font, style)
				doc.setTextColor(...colour)
				const lines = doc.splitTextToSize(text, maxW)
				const lh = lineH ?? size * 0.45
				for (const line of lines) {
					if (y + lh > pageH - margin - 10) {
						addPageWithFooter()
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
				gap(7)
			}

			let pageNum = 1

			function addFooter() {
				const footerY = pageH - 10
				// Logo — small, left-aligned, preserving 2.29:1 aspect ratio
				const footerLogoW = 18
				const footerLogoH = footerLogoW / 2.29
				try {
					doc.addImage(
						logoDataUrl,
						"PNG",
						margin,
						footerY - footerLogoH + 1,
						footerLogoW,
						footerLogoH,
					)
				} catch {
					// fallback if logo fails
					doc.setFontSize(7)
					doc.setFont("helvetica", "bold")
					doc.setTextColor(107, 114, 128)
					doc.text("DeepMark", margin, footerY)
				}
				// Student + paper reference — centre
				doc.setFontSize(7)
				doc.setFont("helvetica", "normal")
				doc.setTextColor(156, 163, 175)
				const footerRef = `${studentName} — ${paperTitle}`.slice(0, 80)
				doc.text(footerRef, pageW / 2, footerY, { align: "center" })
				// Page number — right
				doc.text(`Page ${pageNum}`, pageW - margin, footerY, {
					align: "right",
				})
			}

			function addPageWithFooter() {
				addFooter()
				pageNum++
				doc.addPage()
			}

			// ── Title Page Header ───────────────────────────────────────────

			// Logo — right-aligned, preserving 2.29:1 aspect ratio
			const titleLogoW = 40
			const titleLogoH = titleLogoW / 2.29
			try {
				doc.addImage(
					logoDataUrl,
					"PNG",
					pageW - margin - titleLogoW,
					y - 2,
					titleLogoW,
					titleLogoH,
				)
				gap(titleLogoH + 4)
			} catch {
				gap(2)
			}

			addText(studentName, { size: 18, style: "bold" })
			gap(1)
			if (paperTitle) addText(paperTitle, { size: 11, colour: [107, 114, 128] })
			gap(3)
			addText(
				`Total: ${data.total_awarded} / ${data.total_max}  (${scorePercent}%)`,
				{ size: 13, style: "bold" },
			)
			gap(4)
			hRule([17, 24, 39])

			// ── Examiner summary ────────────────────────────────────────────
			if (data.examiner_summary) {
				addText("Examiner Summary", { size: 10, style: "bold" })
				gap(2)
				addText(data.examiner_summary, { size: 9, colour: [55, 65, 81] })
				gap(4)
				hRule()
			}

			// ── MCQ summary table ───────────────────────────────────────────
			const mcqResults = data.grading_results.filter(
				(r) => r.marking_method === "deterministic",
			)
			const writtenResults = data.grading_results.filter(
				(r) => r.marking_method !== "deterministic",
			)

			if (mcqResults.length > 0) {
				addText("Multiple Choice Questions", { size: 10, style: "bold" })
				gap(3)

				// Table header
				const colX = {
					question: margin,
					correct: margin + 30,
					student: margin + 65,
					mark: margin + 100,
				}
				doc.setFontSize(8)
				doc.setFont("helvetica", "bold")
				doc.setTextColor(107, 114, 128)
				doc.text("Question", colX.question, y)
				doc.text("Correct Answer", colX.correct, y)
				doc.text("Student Answer", colX.student, y)
				doc.text("Mark", colX.mark, y)
				gap(4)
				hRule([200, 200, 200])

				// Table rows
				const mcqTotalAwarded = mcqResults.reduce(
					(s, r) => s + r.awarded_score,
					0,
				)
				const mcqTotalMax = mcqResults.reduce((s, r) => s + r.max_score, 0)

				for (const r of mcqResults) {
					if (y + 5 > pageH - margin - 10) {
						addPageWithFooter()
						y = margin
					}
					const correct = r.correct_option_labels?.[0] ?? "-"
					const student = r.student_answer?.trim() || "-"
					const isCorrect = r.awarded_score > 0
					const markColour: [number, number, number] = isCorrect
						? [22, 163, 74]
						: [220, 38, 38]

					doc.setFontSize(9)
					doc.setFont("helvetica", "normal")
					doc.setTextColor(17, 24, 39)
					doc.text(`Q${r.question_number}`, colX.question, y)
					doc.text(correct, colX.correct, y)
					doc.text(student, colX.student, y)
					doc.setTextColor(...markColour)
					doc.setFont("helvetica", "bold")
					doc.text(`${r.awarded_score}/${r.max_score}`, colX.mark, y)
					gap(5)
				}

				// MCQ total row
				hRule([200, 200, 200])
				doc.setFontSize(9)
				doc.setFont("helvetica", "bold")
				doc.setTextColor(17, 24, 39)
				doc.text("Total", colX.question, y)
				doc.text(`${mcqTotalAwarded}/${mcqTotalMax}`, colX.mark, y)
				gap(5)

				gap(2)
				hRule()
			}

			// ── Written question cards ──────────────────────────────────────
			for (const r of writtenResults) {
				const pct =
					r.max_score > 0
						? Math.round((r.awarded_score / r.max_score) * 100)
						: 0
				const scoreColour: [number, number, number] =
					pct >= 70 ? [22, 163, 74] : pct >= 40 ? [202, 138, 4] : [220, 38, 38]

				// Question number (left, black) + score and level (right, coloured)
				const isLoR = r.marking_method === "level_of_response"
				const levelTag =
					isLoR && r.level_awarded !== undefined
						? `  [Level ${r.level_awarded}]`
						: ""

				doc.setFontSize(10)
				doc.setFont("helvetica", "bold")
				doc.setTextColor(17, 24, 39)
				doc.text(`Q${r.question_number}`, margin, y)

				const scoreText = `${r.awarded_score}/${r.max_score}${levelTag}`
				doc.setTextColor(...scoreColour)
				doc.text(scoreText, pageW - margin, y, { align: "right" })
				gap(5)

				// Question text — muted, italic
				addText(r.question_text, {
					size: 9,
					colour: [107, 114, 128],
				})
				gap(2)

				// Student answer — Indie Flower font in a box
				const answerText = r.student_answer?.trim() || "(No answer written)"
				doc.setFont("IndieFlower", "normal")
				doc.setFontSize(11)
				const answerLines = doc.splitTextToSize(answerText, contentW - 8)
				const answerLh = 5.5
				const boxH = Math.max(10, answerLines.length * answerLh + 6)
				if (y + boxH > pageH - margin - 10) {
					addPageWithFooter()
					y = margin
				}
				// Re-set font after potential page break (footer resets to helvetica)
				doc.setFont("IndieFlower", "normal")
				doc.setFontSize(11)
				doc.setFillColor(249, 250, 251)
				doc.setDrawColor(229, 231, 235)
				doc.setLineWidth(0.3)
				doc.roundedRect(margin, y, contentW, boxH, 2, 2, "FD")
				doc.setTextColor(55, 65, 81)
				let answerY = y + 5
				for (const line of answerLines) {
					doc.text(line as string, margin + 4, answerY)
					answerY += answerLh
				}
				y += boxH + 3

				// // Feedback summary
				// if (r.feedback_summary) {
				// 	addText(r.feedback_summary, { size: 9, colour: [55, 65, 81] })
				// }

				// WWW bullets
				const www = r.what_went_well ?? []
				if (www.length > 0) {
					gap(2)
					addText("What went well:", {
						size: 8,
						style: "bold",
						colour: [22, 163, 74],
					})
					for (const bullet of www) {
						addText(`  - ${bullet}`, {
							size: 8,
							colour: [17, 24, 39],
						})
					}
				}

				// EBI bullets
				const ebi = r.even_better_if ?? []
				if (ebi.length > 0) {
					gap(2)
					addText("Even better if:", {
						size: 8,
						style: "bold",
						colour: [202, 138, 4],
					})
					for (const bullet of ebi) {
						addText(`  - ${bullet}`, {
							size: 8,
							colour: [17, 24, 39],
						})
					}
				}

				gap(5)
				hRule()
			}

			// ── Final footer on last page ───────────────────────────────────
			gap(2)
			const date = new Date().toLocaleDateString("en-GB", {
				day: "2-digit",
				month: "long",
				year: "numeric",
			})
			addText(`Generated ${date}`, { size: 8, colour: [156, 163, 175] })
			addFooter()

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
			{generating ? "Generating\u2026" : "Export PDF"}
		</Button>
	)
}
