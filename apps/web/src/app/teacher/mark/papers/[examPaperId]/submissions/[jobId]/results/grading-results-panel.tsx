"use client"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import type {
	GradingResult,
	StudentPaperAnnotation,
	StudentPaperResultPayload,
	TeacherOverride,
	UpsertTeacherOverrideInput,
} from "@/lib/marking/types"
import { GradingResultCard } from "./grading-result-card"

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

export function GradingResultsPanel({
	jobId,
	data,
	answers,
	activeQuestionNumber,
	onAnswerSaved,
	annotations = [],
	overridesByQuestionId,
	onOverrideChange,
}: {
	jobId: string
	data: StudentPaperResultPayload
	answers: Record<string, string>
	activeQuestionNumber: string | null
	onAnswerSaved: (questionId: string, text: string) => void
	annotations?: StudentPaperAnnotation[]
	overridesByQuestionId?: Map<string, TeacherOverride>
	onOverrideChange?: (
		questionId: string,
		input: UpsertTeacherOverrideInput | null,
	) => void
}) {
	// Compute effective totals using overrides where present
	const effectiveTotalAwarded = data.grading_results.reduce((sum, r) => {
		const override = overridesByQuestionId?.get(r.question_id)
		return sum + (override?.score_override ?? r.awarded_score)
	}, 0)

	const hasOverrides = overridesByQuestionId && overridesByQuestionId.size > 0

	const scorePercent =
		data.total_max > 0
			? Math.round((effectiveTotalAwarded / data.total_max) * 100)
			: 0

	return (
		<div className="space-y-5">
			{/* Score summary */}
			<Card>
				<CardHeader className="pb-3">
					<CardTitle className="flex items-center justify-between text-base">
						<span>Total score</span>
						<Badge
							variant={scoreBadgeVariant(effectiveTotalAwarded, data.total_max)}
							className="text-sm px-2.5 py-0.5"
						>
							{effectiveTotalAwarded} / {data.total_max}
						</Badge>
					</CardTitle>
				</CardHeader>
				<CardContent>
					<Progress value={scorePercent} className="h-2.5" />
					<div className="mt-1.5 flex items-center justify-between">
						{hasOverrides && (
							<p className="text-[10px] text-blue-500">
								Includes teacher adjustments (AI: {data.total_awarded}/
								{data.total_max})
							</p>
						)}
						<p className="text-xs text-muted-foreground text-right ml-auto">
							{scorePercent}%
						</p>
					</div>
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
					<div className="rounded-xl border shadow-sm overflow-hidden">
						<div className="bg-zinc-50 dark:bg-zinc-900 border-b px-5 py-3">
							<span className="text-xs font-mono font-bold tracking-widest uppercase text-muted-foreground">
								Student Answer Sheet
							</span>
						</div>
						<div className="bg-white dark:bg-zinc-950 divide-y divide-zinc-100 dark:divide-zinc-800/60">
							{data.grading_results.map((r: GradingResult) => (
								<GradingResultCard
									key={r.question_id}
									jobId={jobId}
									result={r}
									currentAnswer={answers[r.question_id] ?? ""}
									isActive={activeQuestionNumber === r.question_number}
									onAnswerSaved={onAnswerSaved}
									annotations={annotations.filter(
										(a) => a.question_id === r.question_id,
									)}
									override={overridesByQuestionId?.get(r.question_id)}
									onOverrideChange={
										onOverrideChange
											? (input) => onOverrideChange(r.question_id, input)
											: undefined
									}
								/>
							))}
						</div>
					</div>
				)}
			</div>
		</div>
	)
}
