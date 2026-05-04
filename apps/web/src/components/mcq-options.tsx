"use client"

import { cn } from "@/lib/utils"
import { Check, X } from "lucide-react"

type McqOption = {
	option_label: string
	option_text: string
}

/**
 * Renders MCQ options with right-aligned checkboxes.
 *
 * Without `studentAnswer` — paper view mode: shows the answer key
 * (green filled tick on correct, empty boxes on rest).
 *
 * With `studentAnswer` — grading view mode: shows what the student
 * picked vs the correct answer (green tick, red cross, ghost indicator).
 */
export function McqOptions({
	options,
	correctLabels,
	studentAnswer,
}: {
	options: McqOption[]
	correctLabels: string[]
	/** The label the student chose (e.g. "B"). Omit for paper/answer-key view. */
	studentAnswer?: string | null
}) {
	const isGradingView = studentAnswer != null

	return (
		<div className="space-y-1.5">
			{options.map((opt) => {
				const isCorrect = correctLabels.includes(opt.option_label)
				const isChosen = isGradingView && opt.option_label === studentAnswer

				return (
					<div
						key={opt.option_label}
						className="flex items-center gap-2.5 text-sm"
					>
						<span className="font-semibold shrink-0 w-5 text-xs tabular-nums">
							{opt.option_label}
						</span>
						<span
							className={cn(
								"flex-1",
								isGradingView &&
									!isChosen &&
									!isCorrect &&
									"text-muted-foreground",
							)}
						>
							{opt.option_text}
						</span>
						<McqCheckbox
							isCorrect={isCorrect}
							isChosen={isChosen}
							isGradingView={isGradingView}
						/>
					</div>
				)
			})}
		</div>
	)
}

function McqCheckbox({
	isCorrect,
	isChosen,
	isGradingView,
}: {
	isCorrect: boolean
	isChosen: boolean
	isGradingView: boolean
}) {
	// Paper view: green filled tick on correct, empty on rest
	if (!isGradingView) {
		if (isCorrect) {
			return (
				<span className="shrink-0 h-4 w-4 border-2 border-success bg-success text-white flex items-center justify-center">
					<Check className="h-3 w-3" strokeWidth={3} />
				</span>
			)
		}
		return (
			<span className="shrink-0 h-4 w-4 border-2 border-zinc-300 dark:border-zinc-600" />
		)
	}

	// Grading view: student chose this AND it's correct
	if (isChosen && isCorrect) {
		return (
			<span className="shrink-0 h-4 w-4 border-2 border-success bg-success text-white flex items-center justify-center">
				<Check className="h-3 w-3" strokeWidth={3} />
			</span>
		)
	}

	// Grading view: student chose this but it's wrong
	if (isChosen && !isCorrect) {
		return (
			<span className="shrink-0 h-4 w-4 border-2 border-destructive bg-destructive text-white flex items-center justify-center">
				<X className="h-3 w-3" strokeWidth={3} />
			</span>
		)
	}

	// Grading view: student didn't choose this but it's the correct one (ghost indicator)
	if (!isChosen && isCorrect) {
		return (
			<span className="shrink-0 h-4 w-4 border-2 border-success-400 text-success-400 flex items-center justify-center">
				<Check className="h-3 w-3" strokeWidth={3} />
			</span>
		)
	}

	// Grading view: not chosen, not correct
	return (
		<span className="shrink-0 h-4 w-4 border-2 border-zinc-300 dark:border-zinc-600" />
	)
}
