"use client"

import { FeedbackOverrideEditor } from "@/components/feedback-override-editor"
import { ScoreOverrideEditor } from "@/components/score-override-editor"
import { cn } from "@/lib/utils"
import type { Node as PmNode } from "@tiptap/pm/model"
import { NodeViewContent, NodeViewWrapper } from "@tiptap/react"
import { MessageSquareText } from "lucide-react"
import { useState } from "react"
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
		overridesByQuestionId,
		activeQuestionNumber,
		onOverrideChange,
	} = useGradingData()

	const result = qId ? gradingResults.get(qId) : undefined
	const override = qId ? overridesByQuestionId.get(qId) : undefined
	const aiScore = result?.awarded_score ?? 0
	const max = maxScore ?? result?.max_score ?? 0

	const www = result?.what_went_well ?? []
	const ebi = result?.even_better_if ?? []
	const feedback = override?.feedback_override ?? result?.feedback_summary
	const hasFeedback = !!feedback

	const [showWww, setShowWww] = useState(false)
	const [showEbi, setShowEbi] = useState(false)
	const [showFeedback, setShowFeedback] = useState(false)

	const hasBadges = www.length > 0 || ebi.length > 0 || hasFeedback
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

			{/* Feedback badges + expandable panels */}
			{hasBadges && (
				<div contentEditable={false} className="select-none mt-2 space-y-2">
					{/* Badge row */}
					<div className="flex items-center gap-1.5">
						{www.length > 0 && (
							<button
								type="button"
								onClick={() => setShowWww((v) => !v)}
								title="What went well"
								className={cn(
									"inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide transition-colors",
									showWww
										? "bg-green-500 text-white"
										: "bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/40 dark:text-green-400 dark:hover:bg-green-900/60",
								)}
							>
								WWW
							</button>
						)}
						{ebi.length > 0 && (
							<button
								type="button"
								onClick={() => setShowEbi((v) => !v)}
								title="Even better if"
								className={cn(
									"inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide transition-colors",
									showEbi
										? "bg-amber-500 text-white"
										: "bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-400 dark:hover:bg-amber-900/60",
								)}
							>
								EBI
							</button>
						)}
						{hasFeedback && (
							<button
								type="button"
								onClick={() => setShowFeedback((v) => !v)}
								title="Feedback"
								className={cn(
									"inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors",
									showFeedback
										? "bg-zinc-500 text-white"
										: "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700",
								)}
							>
								<MessageSquareText className="h-2.5 w-2.5" />
								FB
							</button>
						)}
					</div>

					{/* WWW panel */}
					{showWww && www.length > 0 && (
						<ul className="text-xs space-y-0.5">
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
					)}

					{/* EBI panel */}
					{showEbi && ebi.length > 0 && (
						<ul className="text-xs space-y-0.5">
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
					)}

					{/* Feedback panel */}
					{showFeedback && (
						<div className="text-xs space-y-2">
							<FeedbackOverrideEditor
								aiFeedback={result?.feedback_summary ?? null}
								overrideFeedback={override?.feedback_override ?? null}
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
					)}
				</div>
			)}
		</NodeViewWrapper>
	)
}
