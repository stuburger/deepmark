"use client"

import { McqOptions } from "@/components/mcq-options"
import { Progress } from "@/components/ui/progress"
import type {
	CommentPayload,
	GradingResult,
	StudentPaperAnnotation,
	TeacherOverride,
	UpsertTeacherOverrideInput,
} from "@/lib/marking/types"
import { cn } from "@/lib/utils"
import { ChevronDown } from "lucide-react"
import { AnswerEditor } from "./answer-editor"
import { FeedbackOverrideEditor } from "./feedback-override-editor"
import { MarkPointCorrections } from "./mark-point-corrections"
import { ScoreOverrideEditor } from "./score-override-editor"
import { WwwEbiOverrideEditor } from "./www-ebi-override-editor"

export function GradingResultCard({
	jobId,
	result,
	currentAnswer,
	isActive = false,
	onAnswerSaved,
	annotations = [],
	override,
	onOverrideChange,
}: {
	jobId: string
	result: GradingResult
	currentAnswer: string
	isActive?: boolean
	onAnswerSaved: (questionId: string, text: string) => void
	annotations?: StudentPaperAnnotation[]
	override?: TeacherOverride
	onOverrideChange?: (input: UpsertTeacherOverrideInput | null) => void
}) {
	const r = result

	// Effective values: override wins when present
	const effectiveScore = override?.score_override ?? r.awarded_score
	const effectiveWww = override?.www_override ?? r.what_went_well ?? []
	const effectiveEbi = override?.ebi_override ?? r.even_better_if ?? []

	const qPercent =
		r.max_score > 0 ? Math.round((effectiveScore / r.max_score) * 100) : 0

	// Helper to upsert — merges with existing override fields
	function saveOverride(partial: Partial<UpsertTeacherOverrideInput>) {
		if (!onOverrideChange) return
		onOverrideChange({
			score_override: override?.score_override ?? r.awarded_score,
			reason: override?.reason ?? "",
			feedback_override: override?.feedback_override,
			www_override: override?.www_override,
			ebi_override: override?.ebi_override,
			mark_point_corrections: override?.mark_point_corrections,
			...partial,
		})
	}

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
				{onOverrideChange ? (
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
						onSave={(score, reason) =>
							saveOverride({ score_override: score, reason })
						}
						onReset={() => onOverrideChange(null)}
					/>
				) : (
					<span
						className={cn(
							"inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-semibold text-white tabular-nums",
							r.max_score > 0 && effectiveScore / r.max_score >= 0.7
								? "bg-green-500"
								: r.max_score > 0 && effectiveScore / r.max_score >= 0.4
									? "bg-amber-500"
									: "bg-red-500",
						)}
					>
						{effectiveScore}/{r.max_score}
					</span>
				)}
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
					/>
				</div>
			)}

			{/* Margin comments from annotations */}
			{annotations.length > 0 && (
				<div className="flex flex-wrap gap-1.5">
					{annotations
						.filter((a) => a.overlay_type === "comment")
						.map((a) => {
							const text = (a.payload as CommentPayload).text
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

			{/* WWW / EBI — editable when overrides enabled */}
			{r.marking_method !== "deterministic" && (
				<div className="space-y-2 text-xs">
					{onOverrideChange ? (
						<>
							<WwwEbiOverrideEditor
								aiItems={r.what_went_well ?? []}
								overrideItems={override?.www_override ?? null}
								label="What went well"
								variant="www"
								onSave={(items) => saveOverride({ www_override: items })}
								onReset={() => saveOverride({ www_override: undefined })}
							/>
							<WwwEbiOverrideEditor
								aiItems={r.even_better_if ?? []}
								overrideItems={override?.ebi_override ?? null}
								label="Even better if"
								variant="ebi"
								onSave={(items) => saveOverride({ ebi_override: items })}
								onReset={() => saveOverride({ ebi_override: undefined })}
							/>
						</>
					) : (
						<>
							{effectiveWww.length > 0 && (
								<div>
									<p className="text-[10px] font-semibold uppercase tracking-wide text-green-600 dark:text-green-400 mb-0.5">
										What went well
									</p>
									<ul className="space-y-0.5">
										{effectiveWww.map((item, i) => (
											<li
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
							{effectiveEbi.length > 0 && (
								<div>
									<p className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400 mb-0.5">
										Even better if
									</p>
									<ul className="space-y-0.5">
										{effectiveEbi.map((item, i) => (
											<li
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
						</>
					)}
				</div>
			)}

			{/* Collapsible feedback + examiner reasoning — with override support */}
			{r.marking_method !== "deterministic" &&
				(r.feedback_summary || r.llm_reasoning) && (
					<details className="text-xs">
						<summary className="cursor-pointer text-muted-foreground hover:text-foreground list-none flex items-center gap-1 w-fit">
							Feedback <ChevronDown className="h-3 w-3" />
						</summary>
						<div className="mt-2 space-y-3">
							{onOverrideChange ? (
								<FeedbackOverrideEditor
									aiFeedback={r.feedback_summary}
									overrideFeedback={override?.feedback_override ?? null}
									onSave={(text) =>
										saveOverride({ feedback_override: text })
									}
									onReset={() =>
										saveOverride({ feedback_override: undefined })
									}
								/>
							) : (
								r.feedback_summary && (
									<p className="text-muted-foreground leading-relaxed bg-zinc-50 dark:bg-zinc-900 rounded-md px-3 py-2">
										{override?.feedback_override ?? r.feedback_summary}
									</p>
								)
							)}
							{r.llm_reasoning && r.llm_reasoning !== r.feedback_summary && (
								<p className="text-muted-foreground whitespace-pre-wrap leading-relaxed pl-2 border-l">
									{r.llm_reasoning}
								</p>
							)}
						</div>
					</details>
				)}

			{/* Mark point corrections — only for point_based with results */}
			{onOverrideChange &&
				r.marking_method === "point_based" &&
				r.mark_points_results &&
				r.mark_points_results.length > 0 && (
					<details className="text-xs">
						<summary className="cursor-pointer text-muted-foreground hover:text-foreground list-none flex items-center gap-1 w-fit">
							Mark points <ChevronDown className="h-3 w-3" />
						</summary>
						<div className="mt-2">
							<MarkPointCorrections
								markPointsResults={r.mark_points_results}
								corrections={override?.mark_point_corrections ?? null}
								onChange={(corrections) =>
									saveOverride({ mark_point_corrections: corrections })
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
