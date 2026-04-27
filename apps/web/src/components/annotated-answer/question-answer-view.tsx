"use client"

import { FeedbackOverrideEditor } from "@/components/feedback-override-editor"
import { ScoreOverrideEditor } from "@/components/score-override-editor"
import { StimulusDisclosure } from "@/components/stimulus-disclosure"
import { resolveTeacherOverride } from "@/lib/marking/overrides/resolve"
import { cn } from "@/lib/utils"
import { questionAnswerAttrsSchema } from "@mcp-gcse/shared"
import type { Node as PmNode } from "@tiptap/pm/model"
import { NodeViewContent, NodeViewWrapper } from "@tiptap/react"
import { MessageSquareText } from "lucide-react"
import { useMemo, useState } from "react"
import { BulletListEditor } from "./bullet-list-editor"
import { useDocOps } from "./doc-ops-context"
import { useGradingData } from "./grading-data-context"

export function QuestionAnswerView({
	node,
}: {
	node: PmNode & { attrs: Record<string, unknown> }
}) {
	// Doc/React boundary: parse once so the rest of the view consumes a
	// fully-typed object without per-attr `as` casts. A malformed doc throws
	// up to the React error boundary — louder is correct here, since silent
	// `undefined`s would render an empty block instead of an obvious error.
	const attrs = questionAnswerAttrsSchema.parse(node.attrs)
	const {
		questionId: qId,
		questionNumber: qNum,
		questionText: qText,
		maxScore,
		awardedScore: docAwardedScore,
		whatWentWell: docWhatWentWell,
		evenBetterIf: docEvenBetterIf,
		teacherOverride: docTeacherOverride,
		teacherFeedbackOverride: docTeacherFeedbackOverride,
	} = attrs

	const { gradingResults, overridesByQuestionId, activeQuestionNumber } =
		useGradingData()
	const { saveOverride, saveFeedbackBullets } = useDocOps()

	const result = qId ? gradingResults.get(qId) : undefined
	const pgOverride = qId ? overridesByQuestionId.get(qId) : undefined
	const override = useMemo(
		() =>
			resolveTeacherOverride(
				docTeacherOverride,
				docTeacherFeedbackOverride,
				pgOverride,
			),
		[docTeacherOverride, docTeacherFeedbackOverride, pgOverride],
	)
	// `null` until the grade Lambda dispatches an awardedScore. Passed through
	// as null to the badge so it can render `?/N` rather than `0/N` and avoid
	// implying a real zero.
	const aiScore = docAwardedScore
	const max = maxScore ?? result?.max_score ?? 0

	// Doc attrs win when present; fall back to the PG projection for older
	// docs that predate the doc-as-truth migration of WWW/EBI.
	const www =
		docWhatWentWell.length > 0
			? docWhatWentWell
			: (result?.what_went_well ?? [])
	const ebi =
		docEvenBetterIf.length > 0
			? docEvenBetterIf
			: (result?.even_better_if ?? [])
	const stimuli = result?.stimuli ?? []
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
						{stimuli.length > 0 && (
							<div className="pt-1">
								<StimulusDisclosure stimuli={stimuli} size="xs" />
							</div>
						)}
					</div>
					<ScoreOverrideEditor
						aiScore={aiScore}
						maxScore={max}
						override={override ?? null}
						onSave={(score, reason) =>
							qId &&
							saveOverride(qId, {
								score_override: score,
								reason,
								feedback_override: override?.feedback_override,
							})
						}
						onReset={() => qId && saveOverride(qId, null)}
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

					{/* WWW panel \u2014 editable */}
					{showWww && (
						<BulletListEditor
							label="What went well"
							items={www}
							placeholder="One bullet per line..."
							onSave={(next) =>
								qId && saveFeedbackBullets(qId, { whatWentWell: next })
							}
						/>
					)}

					{/* EBI panel \u2014 editable */}
					{showEbi && (
						<BulletListEditor
							label="Even better if"
							items={ebi}
							placeholder="One bullet per line..."
							onSave={(next) =>
								qId && saveFeedbackBullets(qId, { evenBetterIf: next })
							}
						/>
					)}

					{/* Feedback panel */}
					{showFeedback && (
						<div className="text-xs space-y-2">
							<FeedbackOverrideEditor
								aiFeedback={result?.feedback_summary ?? null}
								overrideFeedback={override?.feedback_override ?? null}
								onSave={(text) =>
									qId &&
									saveOverride(qId, {
										score_override: override?.score_override ?? aiScore ?? 0,
										reason: override?.reason,
										feedback_override: text,
									})
								}
								onReset={() =>
									qId &&
									saveOverride(qId, {
										score_override: override?.score_override ?? aiScore ?? 0,
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
