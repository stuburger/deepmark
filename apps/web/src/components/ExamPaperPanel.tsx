import type { ExtractedAnswer, GradingResult } from "@/lib/mark-actions"
import { cn } from "@/lib/utils"
import { Loader2 } from "lucide-react"

function scoreColor(awarded: number, max: number): string {
	if (max === 0) return "bg-zinc-400"
	const pct = awarded / max
	if (pct >= 0.7) return "bg-green-500"
	if (pct >= 0.4) return "bg-amber-500"
	return "bg-red-500"
}

export function ExamPaperPanel({
	gradingResults,
	extractedAnswers,
	isGrading = false,
	totalExpected,
	examPaperTitle,
}: {
	gradingResults: GradingResult[]
	extractedAnswers?: ExtractedAnswer[]
	isGrading?: boolean
	/** Total questions expected — used for the progress indicator during grading. */
	totalExpected?: number
	examPaperTitle?: string | null
}) {
	const graded = gradingResults.length
	const totalAwarded = gradingResults.reduce((s, r) => s + r.awarded_score, 0)
	const totalMax = gradingResults.reduce((s, r) => s + r.max_score, 0)
	const overallPct =
		totalMax > 0 ? Math.round((totalAwarded / totalMax) * 100) : 0

	// Fall back to showing extracted answers when no grading has happened yet
	const showExtractedFallback =
		graded === 0 && (extractedAnswers?.length ?? 0) > 0

	return (
		<div className="rounded-xl border shadow-sm overflow-hidden">
			{/* Booklet header */}
			<div className="bg-zinc-50 dark:bg-zinc-900 border-b px-5 py-3 flex items-center justify-between gap-3 min-h-11">
				<div className="flex items-center gap-2 min-w-0">
					{isGrading && (
						<Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />
					)}
					<span className="text-xs font-mono font-bold tracking-widest uppercase text-muted-foreground truncate">
						{isGrading
							? totalExpected
								? `Marking… ${graded} / ${totalExpected}`
								: graded > 0
									? `Marking… ${graded} marked`
									: "Marking in progress…"
							: (examPaperTitle ?? "Student Answer Sheet")}
					</span>
				</div>
				{!isGrading && graded > 0 && (
					<span
						className={cn(
							"inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold text-white",
							scoreColor(totalAwarded, totalMax),
						)}
					>
						{totalAwarded}/{totalMax} · {overallPct}%
					</span>
				)}
			</div>

			{/* Answer rows */}
			<div className="bg-white dark:bg-zinc-950 divide-y divide-zinc-100 dark:divide-zinc-800/60">
				{showExtractedFallback
					? extractedAnswers!.map((a) => (
							<ExtractedAnswerRow key={a.question_number} answer={a} />
						))
					: gradingResults.map((r) => (
							<GradedAnswerRow key={r.question_id} result={r} />
						))}

				{/* Live marking tail indicator */}
				{isGrading && (
					<div className="px-5 py-3.5 flex items-center gap-2 text-xs text-muted-foreground">
						<Loader2 className="h-3 w-3 animate-spin shrink-0" />
						<span>Marking next question…</span>
					</div>
				)}

				{!showExtractedFallback && graded === 0 && !isGrading && (
					<div className="px-5 py-6 text-sm text-center italic text-muted-foreground">
						No results yet.
					</div>
				)}
			</div>
		</div>
	)
}

function ExtractedAnswerRow({ answer: a }: { answer: ExtractedAnswer }) {
	return (
		<div className="px-5 py-4 space-y-1.5">
			<p className="font-mono text-xs font-bold tracking-widest uppercase text-zinc-400 dark:text-zinc-500">
				Q {a.question_number}
			</p>
			{a.answer_text ? (
				<p className="font-handwriting text-base leading-relaxed whitespace-pre-wrap text-zinc-800 dark:text-zinc-200 border-l-2 border-zinc-200 dark:border-zinc-700 pl-3">
					{a.answer_text}
				</p>
			) : (
				<p className="font-handwriting text-base italic text-zinc-400 dark:text-zinc-600 border-l-2 border-dashed border-zinc-200 dark:border-zinc-700 pl-3">
					No answer written
				</p>
			)}
		</div>
	)
}

function GradedAnswerRow({ result: r }: { result: GradingResult }) {
	const color = scoreColor(r.awarded_score, r.max_score)

	return (
		<div className="px-5 py-4 space-y-2 animate-in fade-in slide-in-from-bottom-1 duration-300">
			{/* Question number + text + score badge */}
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

			{/* Student answer — handwriting font */}
			{r.student_answer ? (
				<p className="font-handwriting text-base leading-relaxed whitespace-pre-wrap text-zinc-800 dark:text-zinc-200 border-l-2 border-zinc-200 dark:border-zinc-700 pl-3">
					{r.student_answer}
				</p>
			) : (
				<p className="font-handwriting text-base italic text-zinc-400 dark:text-zinc-600 border-l-2 border-dashed border-zinc-200 dark:border-zinc-700 pl-3">
					No answer written
				</p>
			)}

			{/* Feedback */}
			{r.feedback_summary && (
				<p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed bg-zinc-50 dark:bg-zinc-900 rounded-md px-3 py-2">
					{r.feedback_summary}
				</p>
			)}
		</div>
	)
}
