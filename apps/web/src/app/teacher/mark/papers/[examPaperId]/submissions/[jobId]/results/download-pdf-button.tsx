"use client"

import { Button } from "@/components/ui/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { alignTokensToAnswer } from "@/lib/marking/alignment/align"
import { deriveTextMarks } from "@/lib/marking/alignment/marks"
import { splitIntoSegments } from "@/lib/marking/alignment/segments"
import type { TextMark, TextSegment } from "@/lib/marking/alignment/types"
import type {
	PageToken,
	StudentPaperAnnotation,
	StudentPaperResultPayload,
} from "@/lib/marking/types"
import { ChevronDown, Download, FileText, Loader2 } from "lucide-react"
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

// ── Annotation colour map (matches annotated-answer.tsx) ────────────────────

type RGB = [number, number, number]

const MARK_COLOURS: Record<string, { text: RGB; line: RGB }> = {
	tick: { text: [22, 163, 74], line: [22, 163, 74] },
	cross: { text: [220, 38, 38], line: [220, 38, 38] },
	underline: { text: [59, 130, 246], line: [59, 130, 246] },
	double_underline: { text: [22, 101, 52], line: [22, 101, 52] },
	box: { text: [147, 51, 234], line: [147, 51, 234] },
	circle: { text: [217, 119, 6], line: [217, 119, 6] },
}

const CHAIN_BG: Record<string, RGB> = {
	reasoning: [219, 234, 254],
	evaluation: [254, 243, 199],
	judgement: [237, 233, 254],
}

const AO_COLOURS: Record<string, RGB> = {
	AO1: [37, 99, 235],
	AO2: [219, 39, 119],
	AO3: [22, 163, 74],
}

// ── Legend data (matches annotation-legend.tsx) ─────────────────────────────

const SIGNAL_KEY = [
	{ signal: "+ Tick", meaning: "Creditworthy point", colour: [22, 163, 74] },
	{
		signal: "x Cross",
		meaning: "Incorrect or irrelevant",
		colour: [220, 38, 38],
	},
	{
		signal: "Underline",
		meaning: "Applied or contextualised knowledge",
		colour: [59, 130, 246],
	},
	{
		signal: "Double underline",
		meaning: "Developed reasoning or analysis chain",
		colour: [22, 101, 52],
	},
	{ signal: "Box", meaning: "Key term or concept", colour: [147, 51, 234] },
	{
		signal: "Circle",
		meaning: "Vague or unclear expression",
		colour: [217, 119, 6],
	},
] as const

const CHAIN_KEY = [
	{
		colour: [219, 234, 254],
		label: "Blue highlight",
		meaning: "Reasoning connective",
	},
	{
		colour: [254, 243, 199],
		label: "Amber highlight",
		meaning: "Evaluation connective",
	},
	{
		colour: [237, 233, 254],
		label: "Purple highlight",
		meaning: "Judgement indicator",
	},
] as const

// ── Compute marks per question (pure, no React) ────────────────────────────

function computeMarksPerQuestion(
	gradingResults: StudentPaperResultPayload["grading_results"],
	annotations: StudentPaperAnnotation[],
	pageTokens: PageToken[],
): Map<string, TextMark[]> {
	const marks = new Map<string, TextMark[]>()
	for (const r of gradingResults) {
		if (r.marking_method === "deterministic") continue
		const qTokens = pageTokens.filter((t) => t.question_id === r.question_id)
		if (qTokens.length === 0) continue
		const alignment = alignTokensToAnswer(r.student_answer, qTokens)
		if (Object.keys(alignment.tokenMap).length === 0) continue
		const qAnnotations = annotations.filter(
			(a) => a.question_id === r.question_id,
		)
		if (qAnnotations.length === 0) continue
		const derived = deriveTextMarks(qAnnotations, alignment)
		if (derived.length > 0) marks.set(r.question_id, derived)
	}
	return marks
}

// ── Component ───────────────────────────────────────────────────────────────

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
			const [{ jsPDF }, fontBase64, logoDataUrl] = await Promise.all([
				import("jspdf"),
				loadFont(),
				loadLogo(),
			])

			// Pre-compute annotation marks if needed
			const marksByQuestion =
				includeAnnotations && annotations && pageTokens
					? computeMarksPerQuestion(
							data.grading_results,
							annotations,
							pageTokens,
						)
					: new Map<string, TextMark[]>()

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
					colour?: RGB
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

			function hRule(colour: RGB = [229, 231, 235]) {
				doc.setDrawColor(...colour)
				doc.setLineWidth(0.3)
				doc.line(margin, y, pageW - margin, y)
				gap(7)
			}

			let pageNum = 1

			function addFooter() {
				const footerY = pageH - 10
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
					doc.setFontSize(7)
					doc.setFont("helvetica", "bold")
					doc.setTextColor(107, 114, 128)
					doc.text("DeepMark", margin, footerY)
				}
				doc.setFontSize(7)
				doc.setFont("helvetica", "normal")
				doc.setTextColor(156, 163, 175)
				const footerRef = `${studentName} — ${paperTitle}`.slice(0, 80)
				doc.text(footerRef, pageW / 2, footerY, { align: "center" })
				doc.text(`Page ${pageNum}`, pageW - margin, footerY, { align: "right" })
			}

			function addPageWithFooter() {
				addFooter()
				pageNum++
				doc.addPage()
			}

			// ── Annotated answer rendering ──────────────────────────────────

			function renderAnnotatedAnswer(
				answerText: string,
				questionMarks: TextMark[],
			) {
				const segments = splitIntoSegments(answerText, questionMarks)
				doc.setFont("IndieFlower", "normal")
				doc.setFontSize(11)

				// Measure total height first
				const fullText = answerText
				const allLines = doc.splitTextToSize(fullText, contentW - 8)
				const answerLh = 5.5
				const boxH = Math.max(10, allLines.length * answerLh + 6)
				if (y + boxH > pageH - margin - 10) {
					addPageWithFooter()
					y = margin
				}

				// Draw answer box
				doc.setFont("IndieFlower", "normal")
				doc.setFontSize(11)
				doc.setFillColor(249, 250, 251)
				doc.setDrawColor(229, 231, 235)
				doc.setLineWidth(0.3)
				doc.roundedRect(margin, y, contentW, boxH, 2, 2, "FD")

				// Render segments with marks
				let cursorX = margin + 4
				let cursorY = y + 5
				const maxX = margin + contentW - 4

				for (const seg of segments) {
					renderSegment(seg, cursorX, cursorY, maxX, answerLh, (nx, ny) => {
						cursorX = nx
						cursorY = ny
					})
				}

				y += boxH + 3
			}

			function renderSegment(
				seg: TextSegment,
				initX: number,
				initY: number,
				maxX: number,
				lineH: number,
				updatePos: (x: number, y: number) => void,
			) {
				let startX = initX
				const startY = initY
				doc.setFont("IndieFlower", "normal")
				doc.setFontSize(11)

				const inlineMarks = seg.marks
				const aoMarks = seg.marks.filter((m) => m.attrs.ao_category)

				// Determine text colour from marks
				let textColour: RGB = [55, 65, 81]
				let hasUnderline = false
				let underlineColour: RGB = [0, 0, 0]
				let isDouble = false
				let hasBg = false
				let bgColour: RGB = [219, 234, 254]
				let hasBox = false
				let boxColour: RGB = [147, 51, 234]

				for (const m of inlineMarks) {
					const mc = MARK_COLOURS[m.type]
					if (mc) textColour = mc.text

					if (
						m.type === "underline" ||
						m.type === "tick" ||
						m.type === "cross" ||
						m.type === "double_underline"
					) {
						hasUnderline = true
						underlineColour = mc?.line ?? [0, 0, 0]
						isDouble = m.type === "double_underline"
					}
					if (m.type === "box") {
						hasBox = true
						boxColour = mc?.line ?? [147, 51, 234]
					}
					// PDF: circle rendered as amber highlight (should eventually change to red underline)
					if (m.type === "circle") {
						hasBg = true
						bgColour = [254, 243, 199]
					}
					if (m.type === "chain") {
						hasBg = true
						const ct = m.attrs.chainType as string | undefined
						bgColour = CHAIN_BG[ct ?? "reasoning"] ?? CHAIN_BG.reasoning
					}
				}

				// Render leading symbol for tick/cross
				for (const m of inlineMarks) {
					if (m.type === "tick") {
						doc.setFont("helvetica", "bold")
						doc.setFontSize(8)
						doc.setTextColor(22, 163, 74)
						doc.text("+", startX, startY)
						startX += 3
						doc.setFont("IndieFlower", "normal")
						doc.setFontSize(11)
					} else if (m.type === "cross") {
						doc.setFont("helvetica", "bold")
						doc.setFontSize(8)
						doc.setTextColor(220, 38, 38)
						doc.text("x", startX, startY)
						startX += 3
						doc.setFont("IndieFlower", "normal")
						doc.setFontSize(11)
					}
				}

				// Word-wrap the segment text
				const words = seg.text.split(/(\s+)/)
				let cx = startX
				let cy = startY

				for (const word of words) {
					if (word.length === 0) continue
					const wordW = doc.getTextWidth(word)
					if (cx + wordW > maxX && cx > margin + 4) {
						cx = margin + 4
						cy += lineH
					}

					// Background highlight
					if (hasBg) {
						doc.setFillColor(...bgColour)
						doc.rect(cx, cy - 3.5, wordW, 4.5, "F")
					}

					// Box/circle border
					if (hasBox) {
						doc.setDrawColor(...boxColour)
						doc.setLineWidth(0.4)
						doc.rect(cx - 0.5, cy - 3.5, wordW + 1, 4.5)
					}

					// Text
					doc.setTextColor(...textColour)
					doc.text(word, cx, cy)

					// Underline
					if (hasUnderline) {
						const ulY = cy + 1
						doc.setDrawColor(...underlineColour)
						doc.setLineWidth(0.4)
						doc.line(cx, ulY, cx + wordW, ulY)
						if (isDouble) {
							doc.line(cx, ulY + 0.7, cx + wordW, ulY + 0.7)
						}
					}

					cx += wordW
				}

				// AO tag pills
				doc.setFont("helvetica", "bold")
				doc.setFontSize(7)
				for (const tm of aoMarks) {
					const display = (tm.attrs.ao_display as string) ?? (tm.attrs.ao_category as string) ?? "?"
					const tagColour = AO_COLOURS[display] ?? [107, 114, 128]
					const tagW = doc.getTextWidth(display) + 3
					if (cx + tagW + 2 > maxX) {
						cx = margin + 4
						cy += lineH
					}
					cx += 1.5
					doc.setDrawColor(...tagColour)
					doc.setLineWidth(0.3)
					doc.rect(cx, cy - 3, tagW, 3.5)
					doc.setTextColor(...tagColour)
					doc.text(display, cx + 1.5, cy - 0.3)
					cx += tagW + 1
				}

				doc.setFont("IndieFlower", "normal")
				doc.setFontSize(11)
				updatePos(cx, cy)
			}

			// ── Title Page Header ───────────────────────────────────────────

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
					const markColour: RGB = isCorrect ? [22, 163, 74] : [220, 38, 38]

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
				const scoreColour: RGB =
					pct >= 70 ? [22, 163, 74] : pct >= 40 ? [202, 138, 4] : [220, 38, 38]

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

				addText(r.question_text, { size: 9, colour: [107, 114, 128] })
				gap(2)

				// Student answer — annotated or plain
				const answerText = r.student_answer?.trim() || "(No answer written)"
				const questionMarks = marksByQuestion.get(r.question_id)

				if (includeAnnotations && questionMarks && questionMarks.length > 0) {
					renderAnnotatedAnswer(answerText, questionMarks)
				} else {
					// Plain Indie Flower rendering
					doc.setFont("IndieFlower", "normal")
					doc.setFontSize(11)
					const answerLines = doc.splitTextToSize(answerText, contentW - 8)
					const answerLh = 5.5
					const boxH = Math.max(10, answerLines.length * answerLh + 6)
					if (y + boxH > pageH - margin - 10) {
						addPageWithFooter()
						y = margin
					}
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
				}

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
						addText(`  - ${bullet}`, { size: 8, colour: [17, 24, 39] })
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
						addText(`  - ${bullet}`, { size: 8, colour: [17, 24, 39] })
					}
				}

				gap(5)
				hRule()
			}

			// ── Legend page (only with annotations) ─────────────────────────
			if (includeAnnotations && marksByQuestion.size > 0) {
				addPageWithFooter()
				y = margin

				addText("Annotation Key", { size: 14, style: "bold" })
				gap(6)

				// Mark signals
				addText("Mark Signals", {
					size: 9,
					style: "bold",
					colour: [107, 114, 128],
				})
				gap(3)
				for (const s of SIGNAL_KEY) {
					doc.setFontSize(9)
					doc.setFont("helvetica", "bold")
					doc.setTextColor(...(s.colour as unknown as RGB))
					doc.text(s.signal, margin + 2, y)
					doc.setFont("helvetica", "normal")
					doc.setTextColor(107, 114, 128)
					doc.text(s.meaning, margin + 40, y)
					gap(5)
				}
				gap(3)

				// Chain highlights
				addText("Chain Highlights", {
					size: 9,
					style: "bold",
					colour: [107, 114, 128],
				})
				gap(3)
				for (const c of CHAIN_KEY) {
					doc.setFillColor(...(c.colour as unknown as RGB))
					doc.rect(margin + 2, y - 3, 8, 3.5, "F")
					doc.setFontSize(9)
					doc.setFont("helvetica", "normal")
					doc.setTextColor(107, 114, 128)
					doc.text(c.meaning, margin + 14, y)
					gap(5)
				}
				gap(3)

				// Dynamic AO labels
				const aoLabels = [
					...new Set(
						(annotations ?? [])
							.filter((a) => a.overlay_type === "annotation")
							.map((a) => (a.payload as { ao_category?: string }).ao_category)
							.filter((c): c is string => !!c),
					),
				].sort()

				if (aoLabels.length > 0) {
					addText("Assessment Objectives (this paper)", {
						size: 9,
						style: "bold",
						colour: [107, 114, 128],
					})
					gap(3)
					let aoX = margin + 2
					for (const ao of aoLabels) {
						const aoColour = AO_COLOURS[ao] ?? [107, 114, 128]
						doc.setFontSize(8)
						doc.setFont("helvetica", "bold")
						const aoW = doc.getTextWidth(ao) + 4
						doc.setDrawColor(...aoColour)
						doc.setLineWidth(0.3)
						doc.rect(aoX, y - 3, aoW, 4)
						doc.setTextColor(...aoColour)
						doc.text(ao, aoX + 2, y - 0.3)
						aoX += aoW + 3
					}
					gap(8)
				}
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

			const suffix = includeAnnotations ? "-annotated" : ""
			const filename = `${studentName.replace(/\s+/g, "-")}${suffix}-grading-report.pdf`
			doc.save(filename)
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
