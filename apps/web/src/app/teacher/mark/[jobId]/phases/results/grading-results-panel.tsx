"use client"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import type {
	GradingResult,
	StudentPaperResultPayload,
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

/**
 * Displays the total score summary and per-question breakdown.
 * Used inside the results sidebar in the completed phase.
 */
export function GradingResultsPanel({
	jobId,
	data,
	answers,
	activeQuestionNumber,
	onAnswerSaved,
}: {
	jobId: string
	data: StudentPaperResultPayload
	answers: Record<string, string>
	activeQuestionNumber: string | null
	onAnswerSaved: (questionId: string, text: string) => void
}) {
	const scorePercent =
		data.total_max > 0
			? Math.round((data.total_awarded / data.total_max) * 100)
			: 0

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
								/>
							))}
						</div>
					</div>
				)}
			</div>
		</div>
	)
}
