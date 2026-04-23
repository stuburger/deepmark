"use client"

import { McqOptions } from "@/components/mcq-options"
import { StimulusDisclosure } from "@/components/stimulus-disclosure"
import { Progress } from "@/components/ui/progress"
import type { McqOption } from "@/lib/marking/types"
import { cn } from "@/lib/utils"
import { NodeViewWrapper } from "@tiptap/react"
import { useGradingData } from "./grading-data-context"

export function McqAnswerView({
	node,
}: {
	node: {
		attrs: Record<string, unknown>
	}
}) {
	const qId = node.attrs.questionId as string | null
	const qNum = node.attrs.questionNumber as string | null
	const qText = node.attrs.questionText as string | null
	const maxScore = node.attrs.maxScore as number | null
	const options = node.attrs.options as McqOption[]
	const correctLabels = node.attrs.correctLabels as string[]
	const studentAnswer = node.attrs.studentAnswer as string | null
	const awardedScore = node.attrs.awardedScore as number

	const { overridesByQuestionId, activeQuestionNumber, gradingResults } =
		useGradingData()
	const result = qId ? gradingResults.get(qId) : undefined
	const stimuli = result?.stimuli ?? []
	const override = qId ? overridesByQuestionId.get(qId) : undefined
	const effectiveScore = override?.score_override ?? awardedScore
	const pct =
		maxScore != null && maxScore > 0
			? Math.round((effectiveScore / maxScore) * 100)
			: 0

	const isActive = activeQuestionNumber === qNum

	const badgeColor = override
		? "bg-blue-500"
		: pct >= 70
			? "bg-green-500"
			: pct >= 40
				? "bg-amber-500"
				: "bg-red-500"

	return (
		<NodeViewWrapper
			id={qNum ? `question-${qNum}` : undefined}
			className={cn(
				"py-4 border-b border-dashed border-zinc-200 dark:border-zinc-700 last:border-0 transition-all duration-300",
				isActive && "bg-blue-500/20",
			)}
		>
			<div contentEditable={false}>
				{/* Header */}
				{qNum && (
					<div className="flex items-start justify-between gap-2 mb-3">
						<div className="space-y-0.5 flex-1 min-w-0">
							<p className="font-mono text-xs font-bold tracking-widest uppercase text-zinc-400 dark:text-zinc-500">
								Q{qNum}
							</p>
							{qText && (
								<p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 leading-snug">
									{qText}
								</p>
							)}
							{stimuli.length > 0 && (
								<div className="pt-1">
									<StimulusDisclosure stimuli={stimuli} size="xs" />
								</div>
							)}
						</div>
						<span
							className={cn(
								"inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-semibold text-white tabular-nums",
								badgeColor,
							)}
						>
							{effectiveScore}/{maxScore ?? 0}
						</span>
					</div>
				)}

				{/* MCQ options */}
				<McqOptions
					options={options}
					correctLabels={correctLabels}
					studentAnswer={studentAnswer}
				/>

				{/* Score progress */}
				<div className="mt-3 flex items-center gap-2">
					<Progress value={pct} className="h-1.5 flex-1" />
					<span className="text-xs text-muted-foreground tabular-nums w-8 text-right">
						{pct}%
					</span>
				</div>
			</div>
		</NodeViewWrapper>
	)
}
