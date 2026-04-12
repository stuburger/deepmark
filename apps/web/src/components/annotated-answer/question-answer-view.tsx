"use client"

import { NodeViewContent, NodeViewWrapper } from "@tiptap/react"

export function QuestionAnswerView({
	node,
}: {
	node: { attrs: Record<string, unknown> }
}) {
	const qNum = node.attrs.questionNumber as string | null
	const qText = node.attrs.questionText as string | null
	const maxScore = node.attrs.maxScore as number | null

	return (
		<NodeViewWrapper className="py-4 border-b border-dashed border-zinc-200 dark:border-zinc-700 last:border-0">
			{/* Non-editable question header */}
			{qNum && (
				<div
					className="flex items-start gap-2 mb-2 select-none"
					contentEditable={false}
				>
					<span className="font-mono text-xs font-bold tracking-widest uppercase text-zinc-400 dark:text-zinc-500 shrink-0">
						Q{qNum}
					</span>
					{qText && (
						<p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 leading-snug flex-1">
							{qText}
						</p>
					)}
					{maxScore != null && (
						<span className="text-xs text-muted-foreground shrink-0 tabular-nums">
							[{maxScore} {maxScore === 1 ? "mark" : "marks"}]
						</span>
					)}
				</div>
			)}

			{/* Editable answer content — marks render here */}
			<NodeViewContent className="text-sm leading-relaxed whitespace-pre-wrap font-handwriting text-base" />
		</NodeViewWrapper>
	)
}
