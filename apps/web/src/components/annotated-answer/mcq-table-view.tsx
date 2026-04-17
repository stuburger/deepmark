"use client"

import { McqOptions } from "@/components/mcq-options"
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover"
import type { McqOption } from "@/lib/marking/types"
import { cn } from "@/lib/utils"
import { NodeViewWrapper } from "@tiptap/react"
import { Check, X } from "lucide-react"
import { useGradingData } from "./grading-data-context"

type McqRow = {
	questionId: string
	questionNumber: string
	questionText: string | null
	maxScore: number
	options: McqOption[]
	correctLabels: string[]
	studentAnswer: string | null
	awardedScore: number
}

/** Shared grid template so header, data rows, and footer columns align. */
const ROW_GRID =
	"grid grid-cols-[2.5rem_4rem_4rem_1.25rem_3rem] gap-x-2 items-center"

export function McqTableView({
	node,
}: {
	node: { attrs: Record<string, unknown> }
}) {
	const results = node.attrs.results as McqRow[]
	const { overridesByQuestionId, activeQuestionNumber } = useGradingData()

	const totalAwarded = results.reduce((sum, r) => {
		const override = overridesByQuestionId.get(r.questionId)
		return sum + (override?.score_override ?? r.awardedScore)
	}, 0)
	const totalMax = results.reduce((sum, r) => sum + r.maxScore, 0)

	if (results.length === 0) return null

	return (
		<NodeViewWrapper className="py-4 border-b border-dashed border-zinc-200 dark:border-zinc-700 last:border-0">
			<div contentEditable={false}>
				<p className="font-mono text-[10px] font-bold tracking-widest uppercase text-zinc-400 dark:text-zinc-500 mb-2">
					Multiple Choice
				</p>

				{/* Header */}
				<div
					className={cn(
						ROW_GRID,
						"py-1 text-[10px] text-muted-foreground font-medium border-b border-zinc-200 dark:border-zinc-700",
					)}
				>
					<span>Q</span>
					<span>Correct</span>
					<span>Student</span>
					<span />
					<span className="text-right">Mark</span>
				</div>

				{/* Data rows */}
				{results.map((r) => {
					const override = overridesByQuestionId.get(r.questionId)
					const effectiveScore = override?.score_override ?? r.awardedScore
					const isCorrect = effectiveScore === r.maxScore
					const isActive = activeQuestionNumber === r.questionNumber

					return (
						<Popover key={r.questionId}>
							<PopoverTrigger
								id={`question-${r.questionNumber}`}
								className={cn(
									ROW_GRID,
									"w-full text-left text-xs py-1.5 cursor-pointer rounded-sm transition-colors hover:bg-muted/50",
									isActive && "bg-blue-500/20",
								)}
							>
								<span className="font-mono text-muted-foreground">
									Q{r.questionNumber}
								</span>
								<span>{r.correctLabels[0] ?? "–"}</span>
								<span className="font-medium">
									{r.studentAnswer?.trim() || "–"}
								</span>
								<span>
									{isCorrect ? (
										<Check
											className="h-3.5 w-3.5 text-emerald-500"
											strokeWidth={3}
										/>
									) : (
										<X className="h-3.5 w-3.5 text-red-500" strokeWidth={3} />
									)}
								</span>
								<span
									className={cn(
										"text-right font-semibold tabular-nums",
										override
											? "text-blue-500"
											: isCorrect
												? "text-emerald-600"
												: "text-red-500",
									)}
								>
									{effectiveScore}/{r.maxScore}
								</span>
							</PopoverTrigger>
							<PopoverContent side="right" align="start" className="w-64">
								{r.questionText && (
									<p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2 leading-snug">
										{r.questionText}
									</p>
								)}
								<McqOptions
									options={r.options}
									correctLabels={r.correctLabels}
									studentAnswer={r.studentAnswer}
								/>
							</PopoverContent>
						</Popover>
					)
				})}

				{/* Total row */}
				<div
					className={cn(
						ROW_GRID,
						"py-1.5 text-xs font-semibold border-t border-zinc-200 dark:border-zinc-700",
					)}
				>
					<span>Total</span>
					<span />
					<span />
					<span />
					<span className="text-right tabular-nums">
						{totalAwarded}/{totalMax}
					</span>
				</div>
			</div>
		</NodeViewWrapper>
	)
}
