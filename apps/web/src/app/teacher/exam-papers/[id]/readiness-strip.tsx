import { cn } from "@/lib/utils"

function readyText(ready: boolean): string {
	return ready
		? "text-success-600 dark:text-success-400"
		: "text-warning-600 dark:text-warning-400"
}

function readyDot(ready: boolean): string {
	return ready ? "bg-success" : "bg-warning"
}

function ReadinessIndicator({
	ready,
	label,
}: {
	ready: boolean
	label: string
}) {
	return (
		<span className={cn("flex items-center gap-1.5", readyText(ready))}>
			<span
				className={cn("h-1.5 w-1.5 shrink-0 rounded-full", readyDot(ready))}
			/>
			{label}
		</span>
	)
}

export function ReadinessStrip({
	hasQuestionPaper,
	allQuestionsHaveMarkSchemes,
	questionsWithMarkScheme,
	totalQuestions,
	hasExemplar,
	hasLevelDescriptors,
}: {
	hasQuestionPaper: boolean
	allQuestionsHaveMarkSchemes: boolean
	questionsWithMarkScheme: number
	totalQuestions: number
	hasExemplar: boolean
	hasLevelDescriptors: boolean
}) {
	return (
		<div className="flex items-center gap-3 rounded-lg border px-3 py-2 text-xs text-muted-foreground">
			<div className="flex flex-1 flex-wrap items-center gap-x-4 gap-y-1">
				<ReadinessIndicator ready={hasQuestionPaper} label="Question paper" />
				<span
					className={cn(
						"flex items-center gap-1.5",
						readyText(allQuestionsHaveMarkSchemes),
					)}
				>
					<span
						className={cn(
							"h-1.5 w-1.5 shrink-0 rounded-full",
							readyDot(allQuestionsHaveMarkSchemes),
						)}
					/>
					Mark schemes
					{!allQuestionsHaveMarkSchemes && totalQuestions > 0 && (
						<span className="tabular-nums">
							({questionsWithMarkScheme}/{totalQuestions})
						</span>
					)}
				</span>
				<span
					className={cn(
						"flex items-center gap-1.5",
						readyText(hasLevelDescriptors),
					)}
				>
					<span
						className={cn(
							"h-1.5 w-1.5 shrink-0 rounded-full",
							readyDot(hasLevelDescriptors),
						)}
					/>
					Level descriptors (recommended)
				</span>
				<span className="flex items-center gap-1.5">
					<span
						className={cn(
							"h-1.5 w-1.5 shrink-0 rounded-full",
							hasExemplar ? "bg-success" : "bg-muted-foreground/40",
						)}
					/>
					Exemplars (optional)
				</span>
			</div>
		</div>
	)
}
