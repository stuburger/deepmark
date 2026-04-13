"use client"

import { McqOptions } from "@/components/mcq-options"
import { Progress } from "@/components/ui/progress"
import type { TextMark } from "@/lib/marking/token-alignment"
import type {
	GradingResult,
	StudentPaperAnnotation,
	TeacherOverride,
	UpsertTeacherOverrideInput,
} from "@/lib/marking/types"
import { cn } from "@/lib/utils"
import { ChevronDown } from "lucide-react"
import { AnnotatedAnswer } from "./annotated-answer"
import { AnswerEditor } from "./answer-editor"
import { FeedbackOverrideEditor } from "./feedback-override-editor"
import { ScoreOverrideEditor } from "./score-override-editor"

export function GradingResultCard({
	jobId,
	result,
	currentAnswer,
	isActive = false,
	onAnswerSaved,
	questionMarks,
	annotations = [],
	override,
	onOverrideChange,
}: {
	jobId: string
	result: GradingResult
	currentAnswer: string
	isActive?: boolean
	onAnswerSaved: (questionId: string, text: string) => void
	/** Pre-computed text marks from alignment (avoids recomputing per card) */
	questionMarks?: TextMark[]
	annotations?: StudentPaperAnnotation[]
	override?: TeacherOverride
	onOverrideChange?: (input: UpsertTeacherOverrideInput | null) => void
}) {
	const r = result
	const isEditing = !!onOverrideChange

	const effectiveScore = override?.score_override ?? r.awarded_score
	const www = r.what_went_well ?? []
	const ebi = r.even_better_if ?? []

	const qPercent =
		r.max_score > 0 ? Math.round((effectiveScore / r.max_score) * 100) : 0

	return (
		<div
			id={`question-${r.question_number}`}
			className={cn(
				"px-5 py-4 space-y-3 transition-all duration-300",
				isActive && "bg-blue-500/20",
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
				<ScoreOverrideEditor
					aiScore={r.awarded_score}
					maxScore={r.max_score}
					override={
						override
							? {
									score_override: override.score_override,
									reason: override.reason,
								}
							: null
					}
					isEditing={isEditing}
					onSave={(score, reason) =>
						onOverrideChange?.({
							score_override: score,
							reason,
							feedback_override: override?.feedback_override,
						})
					}
					onReset={() => onOverrideChange?.(null)}
				/>
			</div>

			{/* Student answer — MCQ or written */}
			{r.marking_method === "deterministic" &&
			r.multiple_choice_options &&
			r.correct_option_labels ? (
				<div>
					<McqOptions
						options={r.multiple_choice_options}
						correctLabels={r.correct_option_labels}
						studentAnswer={r.student_answer}
					/>
				</div>
			) : (
				<div>
					<AnswerEditor
						jobId={jobId}
						questionNumber={r.question_number}
						initialText={currentAnswer}
						onSaved={(newText) => onAnswerSaved(r.question_id, newText)}
						readOnlyContent={
							questionMarks && questionMarks.length > 0 ? (
								<AnnotatedAnswer answer={currentAnswer} marks={questionMarks} />
							) : undefined
						}
					/>
				</div>
			)}

			{/* Margin comments from annotations */}
			{annotations.length > 0 && (
				<div className="flex flex-wrap gap-1.5">
					{annotations
						.filter(
							(
								a,
							): a is Extract<
								StudentPaperAnnotation,
								{ overlay_type: "annotation" }
							> => a.overlay_type === "annotation" && !!a.payload.comment,
						)
						.map((a) => {
							const text = a.payload.comment
							const borderColor =
								a.sentiment === "positive"
									? "border-green-400 text-green-700 dark:text-green-400"
									: a.sentiment === "negative"
										? "border-red-400 text-red-700 dark:text-red-400"
										: "border-zinc-300 text-zinc-600 dark:text-zinc-400"
							return (
								<span
									key={a.id}
									className={cn(
										"inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium leading-tight",
										borderColor,
									)}
								>
									{text}
								</span>
							)
						})}
				</div>
			)}

			{/* WWW / EBI — always read-only */}
			{r.marking_method !== "deterministic" && (
				<div className="space-y-2 text-xs">
					{www.length > 0 && (
						<div>
							<p className="text-[10px] font-semibold uppercase tracking-wide text-green-600 dark:text-green-400 mb-0.5">
								What went well
							</p>
							<ul className="space-y-0.5">
								{www.map((item, i) => (
									<li
										// biome-ignore lint/suspicious/noArrayIndexKey: static feedback list
										key={i}
										className="text-muted-foreground flex items-start gap-1"
									>
										<span className="text-green-500 shrink-0">{"\u2713"}</span>
										{item}
									</li>
								))}
							</ul>
						</div>
					)}
					{ebi.length > 0 && (
						<div>
							<p className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400 mb-0.5">
								Even better if
							</p>
							<ul className="space-y-0.5">
								{ebi.map((item, i) => (
									<li
										// biome-ignore lint/suspicious/noArrayIndexKey: static feedback list
										key={i}
										className="text-muted-foreground flex items-start gap-1"
									>
										<span className="text-amber-500 shrink-0">{"\u2192"}</span>
										{item}
									</li>
								))}
							</ul>
						</div>
					)}
				</div>
			)}

			{/* Feedback summary (inline) + override editor (collapsible when editing) */}
			{r.marking_method !== "deterministic" && r.feedback_summary && (
				<p className="text-xs text-muted-foreground leading-relaxed">
					{override?.feedback_override ?? r.feedback_summary}
				</p>
			)}
			{isEditing && r.marking_method !== "deterministic" && (
				<details className="text-xs">
					<summary className="cursor-pointer text-muted-foreground hover:text-foreground list-none flex items-center gap-1 w-fit">
						Edit feedback <ChevronDown className="h-3 w-3" />
					</summary>
					<div className="mt-2">
						<FeedbackOverrideEditor
							aiFeedback={r.feedback_summary}
							overrideFeedback={override?.feedback_override ?? null}
							isEditing={isEditing}
							onSave={(text) =>
								onOverrideChange?.({
									score_override: override?.score_override ?? r.awarded_score,
									reason: override?.reason,
									feedback_override: text,
								})
							}
							onReset={() =>
								onOverrideChange?.({
									score_override: override?.score_override ?? r.awarded_score,
									reason: override?.reason,
									feedback_override: undefined,
								})
							}
						/>
					</div>
				</details>
			)}

			{/* Score progress + extras */}
			<div className="space-y-1.5">
				<div className="flex items-center gap-2">
					<Progress value={qPercent} className="h-1.5 flex-1" />
					<span className="text-xs text-muted-foreground tabular-nums w-8 text-right">
						{qPercent}%
					</span>
				</div>
				{r.marking_method === "level_of_response" &&
					r.level_awarded !== undefined && (
						<p className="text-xs text-muted-foreground">
							Level awarded:{" "}
							<span className="font-medium">{r.level_awarded}</span>
						</p>
					)}
			</div>
		</div>
	)
}
