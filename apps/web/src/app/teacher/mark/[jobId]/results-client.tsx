"use client"

import { BoundingBoxViewer } from "@/components/BoundingBoxViewer"
import { HandwritingAnalysisPanel } from "@/components/HandwritingAnalysisPanel"
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import {
	type ScanPageUrl,
	type StudentPaperResultPayload,
	retriggerGrading,
	updateExtractedAnswer,
	updateStudentName,
} from "@/lib/mark-actions"
import { cn } from "@/lib/utils"
import {
	Check,
	ChevronDown,
	Download,
	Highlighter,
	Loader2,
	Pencil,
	PlusCircle,
	RefreshCw,
	X,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

function scoreBadgeVariant(
	awarded: number,
	max: number,
): "default" | "secondary" | "destructive" | "outline" {
	if (max === 0) return "outline"
	const pct = (awarded / max) * 100
	if (pct >= 70) return "default"
	if (pct >= 40) return "secondary"
	return "destructive"
}

function StudentNameEditor({
	jobId,
	initialName,
}: {
	jobId: string
	initialName: string | null
}) {
	const [editing, setEditing] = useState(false)
	const [name, setName] = useState(initialName ?? "")
	const [saving, setSaving] = useState(false)

	async function save() {
		setSaving(true)
		await updateStudentName(jobId, name)
		setSaving(false)
		setEditing(false)
	}

	if (!editing) {
		return (
			<div className="flex items-center gap-2">
				<span className="text-sm font-semibold">
					{name || (
						<span className="text-muted-foreground font-normal italic">
							Unknown student
						</span>
					)}
				</span>
				<button
					type="button"
					onClick={() => setEditing(true)}
					className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
					aria-label="Edit student name"
				>
					<Pencil className="h-3 w-3" />
				</button>
			</div>
		)
	}

	return (
		<div className="flex items-center gap-2">
			<Input
				value={name}
				onChange={(e) => setName(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter") save()
					if (e.key === "Escape") setEditing(false)
				}}
				className="h-7 w-40 text-sm"
				placeholder="Student name"
				autoFocus
			/>
			<Button
				size="sm"
				variant="ghost"
				disabled={saving}
				onClick={save}
				aria-label="Save"
				className="h-7 w-7 p-0"
			>
				<Check className="h-3.5 w-3.5" />
			</Button>
			<Button
				size="sm"
				variant="ghost"
				onClick={() => setEditing(false)}
				aria-label="Cancel"
				className="h-7 w-7 p-0"
			>
				<X className="h-3.5 w-3.5" />
			</Button>
		</div>
	)
}

function AnswerEditor({
	jobId,
	questionNumber,
	initialText,
	onSaved,
}: {
	jobId: string
	questionNumber: string
	initialText: string
	onSaved: (newText: string) => void
}) {
	const [editing, setEditing] = useState(false)
	const [text, setText] = useState(initialText)
	const [saving, setSaving] = useState(false)
	const [error, setError] = useState<string | null>(null)

	async function save() {
		setSaving(true)
		setError(null)
		const result = await updateExtractedAnswer(jobId, questionNumber, text)
		setSaving(false)
		if (!result.ok) {
			setError(result.error)
			return
		}
		onSaved(text)
		setEditing(false)
	}

	function cancel() {
		setText(initialText)
		setEditing(false)
		setError(null)
	}

	if (!editing) {
		return (
			<div className="group relative">
				<p className="text-sm whitespace-pre-wrap rounded-md bg-muted px-3 py-2 pr-8">
					{text || (
						<span className="italic text-muted-foreground">
							No answer written
						</span>
					)}
				</p>
				<button
					type="button"
					onClick={() => setEditing(true)}
					className="absolute top-1.5 right-1.5 rounded p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-background transition-all"
					aria-label="Edit answer"
				>
					<Pencil className="h-3 w-3" />
				</button>
			</div>
		)
	}

	return (
		<div className="space-y-2">
			<Textarea
				value={text}
				onChange={(e) => setText(e.target.value)}
				className="text-sm min-h-20 resize-y"
				autoFocus
			/>
			{error && <p className="text-xs text-destructive">{error}</p>}
			<div className="flex items-center gap-2">
				<Button size="sm" disabled={saving} onClick={save}>
					{saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
					Save
				</Button>
				<Button size="sm" variant="ghost" onClick={cancel}>
					Cancel
				</Button>
				<p className="text-xs text-muted-foreground ml-1">
					Re-mark to update the score
				</p>
			</div>
		</div>
	)
}

function ReMarkButton({ jobId }: { jobId: string }) {
	const router = useRouter()
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	async function handleRemark() {
		setLoading(true)
		setError(null)
		const result = await retriggerGrading(jobId)
		if (!result.ok) {
			setError(result.error)
			setLoading(false)
			return
		}
		router.refresh()
	}

	return (
		<div className="flex flex-col items-start gap-1">
			<Button
				variant="outline"
				size="sm"
				disabled={loading}
				onClick={handleRemark}
			>
				{loading ? (
					<Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
				) : (
					<RefreshCw className="h-3.5 w-3.5 mr-2" />
				)}
				Re-mark
			</Button>
			{error && <p className="text-xs text-destructive">{error}</p>}
		</div>
	)
}

function DownloadPdfButton({ data }: { data: StudentPaperResultPayload }) {
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

			// ── Helper: wrapped text that advances y and adds pages ──────────────
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

			// ── Header ────────────────────────────────────────────────────────────
			addText(studentName, { size: 16, style: "bold" })
			gap(1)
			if (paperTitle) addText(paperTitle, { size: 10, colour: [107, 114, 128] })
			gap(2)
			addText(
				`Total: ${data.total_awarded} / ${data.total_max}  (${scorePercent}%)`,
				{
					size: 12,
					style: "bold",
				},
			)
			gap(3)
			hRule([17, 24, 39])

			// ── Questions ─────────────────────────────────────────────────────────
			for (const r of data.grading_results) {
				const pct =
					r.max_score > 0
						? Math.round((r.awarded_score / r.max_score) * 100)
						: 0
				const scoreColour: [number, number, number] =
					pct >= 70 ? [22, 163, 74] : pct >= 40 ? [202, 138, 4] : [220, 38, 38]

				// Question number + text
				addText(`Q${r.question_number}`, { size: 8, colour: [107, 114, 128] })
				gap(1)
				addText(r.question_text, { size: 10, style: "bold" })
				gap(2)

				// Answer box (light grey background)
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

				// Score
				addText(`Score: ${r.awarded_score} / ${r.max_score}  (${pct}%)`, {
					size: 10,
					style: "bold",
					colour: scoreColour,
				})
				gap(1)

				// Feedback
				if (r.feedback_summary) {
					addText(r.feedback_summary, { size: 9, colour: [55, 65, 81] })
				}

				gap(4)
				hRule()
			}

			// ── Footer ────────────────────────────────────────────────────────────
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
			onClick={handleDownload}
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

// ─── Scrollable scan column ────────────────────────────────────────────────────

function ScrollableScanPages({
	pages,
	showHighlights,
}: {
	pages: ScanPageUrl[]
	showHighlights: boolean
}) {
	if (pages.length === 0) return null

	return (
		<div className="flex flex-col gap-8 px-6 py-6">
			{pages.map((page, i) => {
				const isPdf = page.mimeType === "application/pdf"
				const label =
					pages.length > 1 ? `Page ${i + 1} of ${pages.length}` : null

				return (
					<div key={page.order} className="flex flex-col gap-2">
						{label && (
							<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
								{label}
							</p>
						)}

						{isPdf ? (
							<div className="relative overflow-hidden rounded-xl border bg-muted/20">
								<iframe
									src={page.url}
									title={`Page ${i + 1}`}
									className="h-[80vh] w-full border-0"
								/>
							</div>
						) : page.analysis ? (
							<div className="space-y-2">
								<div className="flex items-center gap-2">
									<span className="text-xs text-muted-foreground">OCR</span>
									<HandwritingAnalysisPanel analysis={page.analysis} />
								</div>
								<BoundingBoxViewer
									imageUrl={page.url}
									analysis={page.analysis}
									showAnalysisText={false}
									showHighlights={showHighlights}
								/>
							</div>
						) : (
							<div className="relative overflow-hidden rounded-xl border bg-muted/20">
								{/* eslint-disable-next-line @next/next/no-img-element -- presigned S3 URL */}
								<img
									src={page.url}
									alt={`Scan page ${i + 1}`}
									className="block w-full rounded-xl"
								/>
							</div>
						)}
					</div>
				)
			})}
		</div>
	)
}

// ─── Main component ───────────────────────────────────────────────────────────

export function MarkingResultsClient({
	jobId,
	data,
	scanPages,
}: {
	jobId: string
	data: StudentPaperResultPayload
	scanPages: ScanPageUrl[]
}) {
	const scorePercent =
		data.total_max > 0
			? Math.round((data.total_awarded / data.total_max) * 100)
			: 0

	const [answers, setAnswers] = useState<Record<string, string>>(
		Object.fromEntries(
			data.grading_results.map((r) => [r.question_id, r.student_answer]),
		),
	)

	const [showHighlights, setShowHighlights] = useState(true)

	const hasScanPages = scanPages.length > 0

	// ── No-scan fallback: single-column layout ─────────────────────────────────
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
				<GradingResults
					jobId={jobId}
					data={data}
					answers={answers}
					scorePercent={scorePercent}
					onAnswerSaved={(id, text) =>
						setAnswers((prev) => ({ ...prev, [id]: text }))
					}
				/>
			</div>
		)
	}

	// ── Full layout: toolbar + scan focal point + sidebar ─────────────────────
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
					<Button
						variant="outline"
						size="sm"
						onClick={() => setShowHighlights((v) => !v)}
						className={cn(
							showHighlights &&
								"bg-primary text-primary-foreground border-primary hover:bg-primary/90 hover:text-primary-foreground",
						)}
					>
						<Highlighter className="h-3.5 w-3.5 mr-2" />
						{showHighlights ? "Highlights on" : "Highlights off"}
					</Button>
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
				{/* Left: scrollable scan pages */}
				<div className="flex-1 overflow-y-auto bg-muted/20">
					<ScrollableScanPages
						pages={scanPages}
						showHighlights={showHighlights}
					/>
				</div>

				{/* Right: results sidebar */}
				<div className="w-96 shrink-0 border-l overflow-y-auto">
					<div className="p-4 space-y-5">
						<GradingResults
							jobId={jobId}
							data={data}
							answers={answers}
							scorePercent={scorePercent}
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

// ─── Grading results panel (shared between layouts) ───────────────────────────

function GradingResults({
	jobId,
	data,
	answers,
	scorePercent,
	onAnswerSaved,
}: {
	jobId: string
	data: StudentPaperResultPayload
	answers: Record<string, string>
	scorePercent: number
	onAnswerSaved: (questionId: string, text: string) => void
}) {
	return (
		<div className="space-y-5">
			{/* Score summary */}
			<Card>
				<CardHeader className="pb-3">
					<CardTitle className="flex items-center justify-between text-base">
						<span>Total score</span>
						<Badge
							variant={scoreBadgeVariant(data.total_awarded, data.total_max)}
							className="text-sm px-2.5 py-0.5"
						>
							{data.total_awarded} / {data.total_max}
						</Badge>
					</CardTitle>
				</CardHeader>
				<CardContent>
					<Progress value={scorePercent} className="h-2.5" />
					<p className="mt-1.5 text-xs text-muted-foreground text-right">
						{scorePercent}%
					</p>
				</CardContent>
			</Card>

			{/* Question breakdown */}
			<div>
				<h2 className="text-sm font-semibold mb-3 uppercase tracking-wide text-muted-foreground">
					Question breakdown
				</h2>
				{data.grading_results.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						No questions were graded.
					</p>
				) : (
					<Accordion className="space-y-2">
						{data.grading_results.map((r) => {
							const qPercent =
								r.max_score > 0
									? Math.round((r.awarded_score / r.max_score) * 100)
									: 0
							return (
								<AccordionItem
									key={r.question_id}
									value={r.question_id}
									className="rounded-lg border px-4"
								>
									<AccordionTrigger className="hover:no-underline py-3">
										<div className="flex items-center gap-3 flex-1 text-left mr-2">
											<span className="shrink-0 text-xs font-mono text-muted-foreground w-4">
												Q{r.question_number}
											</span>
											<p className="text-sm font-medium line-clamp-1 flex-1">
												{r.question_text}
											</p>
											<Badge
												variant={scoreBadgeVariant(
													r.awarded_score,
													r.max_score,
												)}
												className="shrink-0 tabular-nums"
											>
												{r.awarded_score}/{r.max_score}
											</Badge>
										</div>
									</AccordionTrigger>
									<AccordionContent className="pb-4 space-y-3">
										<div>
											<p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
												Student answer
											</p>
											<AnswerEditor
												jobId={jobId}
												questionNumber={r.question_number}
												initialText={answers[r.question_id] ?? ""}
												onSaved={(newText) =>
													onAnswerSaved(r.question_id, newText)
												}
											/>
										</div>
										<div>
											<p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
												Feedback
											</p>
											<p className="text-sm">{r.feedback_summary}</p>
										</div>
										{r.llm_reasoning &&
											r.llm_reasoning !== r.feedback_summary && (
												<details className="text-xs">
													<summary className="cursor-pointer text-muted-foreground hover:text-foreground">
														<span className="inline-flex items-center gap-1">
															Examiner reasoning{" "}
															<ChevronDown className="h-3 w-3" />
														</span>
													</summary>
													<p className="mt-2 text-muted-foreground whitespace-pre-wrap leading-relaxed pl-2 border-l">
														{r.llm_reasoning}
													</p>
												</details>
											)}
										{r.level_awarded !== undefined && (
											<p className="text-xs text-muted-foreground">
												Level awarded:{" "}
												<span className="font-medium">{r.level_awarded}</span>
											</p>
										)}
										<div className="flex items-center gap-2">
											<Progress value={qPercent} className="h-1.5 flex-1" />
											<span className="text-xs text-muted-foreground tabular-nums">
												{qPercent}%
											</span>
										</div>
									</AccordionContent>
								</AccordionItem>
							)
						})}
					</Accordion>
				)}
			</div>
		</div>
	)
}
