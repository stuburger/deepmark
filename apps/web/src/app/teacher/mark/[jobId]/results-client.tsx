"use client"

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
import { Textarea } from "@/components/ui/textarea"
import {
	type ScanPageUrl,
	type StudentPaperResultPayload,
	retriggerGrading,
	updateExtractedAnswer,
	updateStudentName,
} from "@/lib/mark-actions"
import {
	Check,
	ChevronDown,
	Loader2,
	Pencil,
	PlusCircle,
	RefreshCw,
	X,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { ScanPageViewer } from "./scan-viewer"

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
				<span className="text-lg font-semibold">
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
					<Pencil className="h-3.5 w-3.5" />
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
				className="h-8 w-48 text-sm"
				placeholder="Student name"
				autoFocus
			/>
			<Button
				size="sm"
				variant="ghost"
				disabled={saving}
				onClick={save}
				aria-label="Save"
			>
				<Check className="h-3.5 w-3.5" />
			</Button>
			<Button
				size="sm"
				variant="ghost"
				onClick={() => setEditing(false)}
				aria-label="Cancel"
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

	const gradingPanel = (
		<div className="space-y-6">
			{/* Header */}
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
				<div className="flex items-center gap-2 shrink-0">
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

			{/* Score summary */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center justify-between">
						<span>Total score</span>
						<Badge
							variant={scoreBadgeVariant(data.total_awarded, data.total_max)}
							className="text-base px-3 py-1"
						>
							{data.total_awarded} / {data.total_max}
						</Badge>
					</CardTitle>
				</CardHeader>
				<CardContent>
					<Progress value={scorePercent} className="h-3" />
					<p className="mt-2 text-sm text-muted-foreground text-right">
						{scorePercent}%
					</p>
				</CardContent>
			</Card>

			{/* Question breakdown */}
			<div>
				<h2 className="text-lg font-semibold mb-3">Question breakdown</h2>
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
													setAnswers((prev) => ({
														...prev,
														[r.question_id]: newText,
													}))
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

	if (scanPages.length === 0) {
		return <div className="max-w-3xl">{gradingPanel}</div>
	}

	return (
		<div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
			{/* Scan — sticky on large screens */}
			<div className="lg:sticky lg:top-6 lg:w-80 xl:w-96 shrink-0">
				<p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
					Student scan
				</p>
				<ScanPageViewer pages={scanPages} />
			</div>

			{/* Grading results */}
			<div className="flex-1 min-w-0">{gradingPanel}</div>
		</div>
	)
}
