function ReadinessIndicator({
	ready,
	label,
}: {
	ready: boolean
	label: string
}) {
	return (
		<span
			className={`flex items-center gap-1.5 ${
				ready
					? "text-green-600 dark:text-green-400"
					: "text-amber-600 dark:text-amber-400"
			}`}
		>
			<span
				className={`h-1.5 w-1.5 shrink-0 rounded-full ${
					ready ? "bg-green-500" : "bg-amber-500"
				}`}
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
}: {
	hasQuestionPaper: boolean
	allQuestionsHaveMarkSchemes: boolean
	questionsWithMarkScheme: number
	totalQuestions: number
	hasExemplar: boolean
}) {
	return (
		<div className="flex items-center gap-3 rounded-lg border px-3 py-2 text-xs text-muted-foreground">
			<div className="flex flex-1 flex-wrap items-center gap-x-4 gap-y-1">
				<ReadinessIndicator ready={hasQuestionPaper} label="Question paper" />
				<span
					className={`flex items-center gap-1.5 ${
						allQuestionsHaveMarkSchemes
							? "text-green-600 dark:text-green-400"
							: "text-amber-600 dark:text-amber-400"
					}`}
				>
					<span
						className={`h-1.5 w-1.5 shrink-0 rounded-full ${
							allQuestionsHaveMarkSchemes ? "bg-green-500" : "bg-amber-500"
						}`}
					/>
					Mark schemes
					{!allQuestionsHaveMarkSchemes && totalQuestions > 0 && (
						<span className="tabular-nums">
							({questionsWithMarkScheme}/{totalQuestions})
						</span>
					)}
				</span>
				<span className="flex items-center gap-1.5">
					<span
						className={`h-1.5 w-1.5 shrink-0 rounded-full ${
							hasExemplar ? "bg-green-500" : "bg-muted-foreground/40"
						}`}
					/>
					Exemplars (optional)
				</span>
			</div>
		</div>
	)
}
