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
import {
	type StudentPaperResultPayload,
	updateStudentName,
} from "@/lib/mark-actions"
import { Check, ChevronDown, Pencil, PlusCircle, X } from "lucide-react"
import Link from "next/link"
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

export function MarkingResultsClient({
	jobId,
	data,
}: {
	jobId: string
	data: StudentPaperResultPayload
}) {
	const scorePercent =
		data.total_max > 0
			? Math.round((data.total_awarded / data.total_max) * 100)
			: 0

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
				<Link
					href="/teacher/mark/new"
					className={buttonVariants({ size: "sm" })}
				>
					<PlusCircle className="h-3.5 w-3.5 mr-1.5" />
					Mark another
				</Link>
			</div>

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
											<p className="text-sm whitespace-pre-wrap rounded-md bg-muted px-3 py-2">
												{r.student_answer || (
													<span className="italic text-muted-foreground">
														No answer written
													</span>
												)}
											</p>
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
