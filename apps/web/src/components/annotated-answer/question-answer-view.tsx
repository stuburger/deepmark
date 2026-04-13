"use client"

import { FeedbackOverrideEditor } from "@/components/feedback-override-editor"
import { ScoreOverrideEditor } from "@/components/score-override-editor"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import type { Node as PmNode } from "@tiptap/pm/model"
import { NodeViewContent, NodeViewWrapper } from "@tiptap/react"
import { ChevronDown } from "lucide-react"
import { useGradingData } from "./grading-data-context"

export function QuestionAnswerView({
	node,
}: {
	node: PmNode & { attrs: Record<string, unknown> }
}) {
	const qId = node.attrs.questionId as string | null
	const qNum = node.attrs.questionNumber as string | null
	const qText = node.attrs.questionText as string | null
	const maxScore = node.attrs.maxScore as number | null

	const {
		gradingResults,
		answers,
		overridesByQuestionId,
		activeQuestionNumber,
		isEditing,
		onOverrideChange,
	} = useGradingData()

	const result = qId ? gradingResults.get(qId) : undefined
	const override = qId ? overridesByQuestionId.get(qId) : undefined
	const originalText = qId ? (answers[qId] ?? "") : ""
	const textModified = node.textContent !== originalText

	const aiScore = result?.awarded_score ?? 0
	const effectiveScore = override?.score_override ?? aiScore
	const max = maxScore ?? result?.max_score ?? 0
	const pct = max > 0 ? Math.round((effectiveScore / max) * 100) : 0

	const www = result?.what_went_well ?? []
	const ebi = result?.even_better_if ?? []
	const feedback = override?.feedback_override ?? result?.feedback_summary
	const levelAwarded = result?.level_awarded
	const isLoR = result?.marking_method === "level_of_response"

	const isActive = activeQuestionNumber === qNum

	return (
		<NodeViewWrapper
			id={qNum ? `question-${qNum}` : undefined}
			className={cn(
				"py-4 border-b border-dashed border-zinc-200 dark:border-zinc-700 last:border-0 transition-all duration-300",
				isActive && "bg-blue-500/20",
			)}
		>
			{/* Non-editable question header + score badge */}
			{qNum && (
				<div
					className="flex items-start justify-between gap-2 mb-2 select-none"
					contentEditable={false}
				>
					<div className="space-y-0.5 flex-1 min-w-0">
						<span className="font-mono text-xs font-bold tracking-widest uppercase text-zinc-400 dark:text-zinc-500">
							Q{qNum}
						</span>
						{qText && (
							<p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 leading-snug">
								{qText}
							</p>
						)}
					</div>
					<ScoreOverrideEditor
						aiScore={aiScore}
						maxScore={max}
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
							qId &&
							onOverrideChange(qId, {
								score_override: score,
								reason,
								feedback_override: override?.feedback_override,
							})
						}
						onReset={() => qId && onOverrideChange(qId, null)}
					/>
				</div>
			)}

			{/* Editable answer content -- marks render here */}
			<NodeViewContent className="text-sm leading-relaxed whitespace-pre-wrap font-handwriting text-base" />

			{/* Re-mark hint when answer text has been modified */}
			{textModified && (
				<p
					contentEditable={false}
					className="select-none text-[10px] text-amber-600 dark:text-amber-400 mt-1 italic"
				>
					Answer modified — re-mark to update score
				</p>
			)}

			{/* Non-editable grading details below the answer */}
			<div contentEditable={false} className="select-none space-y-2 mt-3">
				{/* WWW / EBI */}
				{(www.length > 0 || ebi.length > 0) && (
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
											<span className="text-green-500 shrink-0">
												{"\u2713"}
											</span>
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
											<span className="text-amber-500 shrink-0">
												{"\u2192"}
											</span>
											{item}
										</li>
									))}
								</ul>
							</div>
						)}
					</div>
				)}

				{/* Feedback summary + override editor */}
				{feedback && !isEditing && (
					<details className="text-xs">
						<summary className="cursor-pointer text-muted-foreground hover:text-foreground list-none flex items-center gap-1 w-fit">
							Feedback <ChevronDown className="h-3 w-3" />
						</summary>
						<p className="mt-1 text-muted-foreground leading-relaxed">
							{feedback}
						</p>
					</details>
				)}
				{isEditing && (
					<details className="text-xs">
						<summary className="cursor-pointer text-muted-foreground hover:text-foreground list-none flex items-center gap-1 w-fit">
							Edit feedback <ChevronDown className="h-3 w-3" />
						</summary>
						<div className="mt-2">
							<FeedbackOverrideEditor
								aiFeedback={result?.feedback_summary ?? null}
								overrideFeedback={override?.feedback_override ?? null}
								isEditing={isEditing}
								onSave={(text) =>
									qId &&
									onOverrideChange(qId, {
										score_override: override?.score_override ?? aiScore,
										reason: override?.reason,
										feedback_override: text,
									})
								}
								onReset={() =>
									qId &&
									onOverrideChange(qId, {
										score_override: override?.score_override ?? aiScore,
										reason: override?.reason,
										feedback_override: undefined,
									})
								}
							/>
						</div>
					</details>
				)}

				{/* Level awarded (LoR only) */}
				{isLoR && levelAwarded !== undefined && (
					<p className="text-xs text-muted-foreground">
						Level awarded: <span className="font-medium">{levelAwarded}</span>
					</p>
				)}

				{/* Score progress bar */}
				<div className="flex items-center gap-2">
					<Progress value={pct} className="h-1.5 flex-1" />
					<span className="text-xs text-muted-foreground tabular-nums w-8 text-right">
						{pct}%
					</span>
				</div>
			</div>
		</NodeViewWrapper>
	)
}
