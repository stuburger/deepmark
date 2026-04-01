"use client"

import { Progress } from "@/components/ui/progress"
import type { GradingResult } from "@/lib/marking/types"
import { cn } from "@/lib/utils"
import { ChevronDown } from "lucide-react"
import { AnswerEditor } from "./answer-editor"

function scoreColor(awarded: number, max: number): string {
	if (max === 0) return "bg-zinc-400"
	const pct = awarded / max
	if (pct >= 0.7) return "bg-green-500"
	if (pct >= 0.4) return "bg-amber-500"
	return "bg-red-500"
}

export function GradingResultCard({
	jobId,
	result,
	currentAnswer,
	isActive = false,
	onAnswerSaved,
}: {
	jobId: string
	result: GradingResult
	currentAnswer: string
	isActive?: boolean
	onAnswerSaved: (questionId: string, text: string) => void
}) {
	const r = result
	const qPercent =
		r.max_score > 0 ? Math.round((r.awarded_score / r.max_score) * 100) : 0
	const color = scoreColor(r.awarded_score, r.max_score)

	return (
		<div
			id={`question-${r.question_number}`}
			className={cn(
				"px-5 py-4 space-y-3 transition-colors duration-300",
				isActive && "bg-primary/5 shadow-[inset_3px_0_0_hsl(var(--primary))]",
			)}
		>
			{/* Header row */}
			<div className="flex items-start justify-between gap-3">
				<div className="space-y-0.5 flex-1 min-w-0">
					<p className="font-mono text-xs font-bold tracking-widest uppercase text-zinc-400 dark:text-zinc-500">
						Q {r.question_number}
					</p>
					{r.question_text && (
						<p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 leading-snug">
							{r.question_text}
						</p>
					)}
				</div>
				<span
					className={cn(
						"inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-semibold text-white tabular-nums",
						color,
					)}
				>
					{r.awarded_score}/{r.max_score}
				</span>
			</div>

			{/* Editable student answer */}
			<div>
				<p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
					Student answer
				</p>
				<AnswerEditor
					jobId={jobId}
					questionNumber={r.question_number}
					initialText={currentAnswer}
					onSaved={(newText) => onAnswerSaved(r.question_id, newText)}
				/>
			</div>

			{/* Feedback */}
			{r.feedback_summary && (
				<div>
					<p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
						Feedback
					</p>
					<p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed bg-zinc-50 dark:bg-zinc-900 rounded-md px-3 py-2">
						{r.feedback_summary}
					</p>
				</div>
			)}

			{/* Score progress + extras */}
			<div className="space-y-1.5">
				<div className="flex items-center gap-2">
					<Progress value={qPercent} className="h-1.5 flex-1" />
					<span className="text-xs text-muted-foreground tabular-nums w-8 text-right">
						{qPercent}%
					</span>
				</div>
				{r.level_awarded !== undefined && (
					<p className="text-xs text-muted-foreground">
						Level awarded:{" "}
						<span className="font-medium">{r.level_awarded}</span>
					</p>
				)}
			</div>

			{/* Collapsible examiner reasoning */}
			{r.llm_reasoning && r.llm_reasoning !== r.feedback_summary && (
				<details className="text-xs">
					<summary className="cursor-pointer text-muted-foreground hover:text-foreground list-none flex items-center gap-1 w-fit">
						Examiner reasoning <ChevronDown className="h-3 w-3" />
					</summary>
					<p className="mt-2 text-muted-foreground whitespace-pre-wrap leading-relaxed pl-2 border-l">
						{r.llm_reasoning}
					</p>
				</details>
			)}
		</div>
	)
}
