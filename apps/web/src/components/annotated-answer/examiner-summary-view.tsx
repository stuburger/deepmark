"use client"

import { updateExaminerSummary } from "@/lib/marking/submissions/mutations"
import type { Node as PmNode } from "@tiptap/pm/model"
import { NodeViewContent, NodeViewWrapper } from "@tiptap/react"
import { useEffect, useRef } from "react"

const SAVE_DEBOUNCE_MS = 1200

export function ExaminerSummaryView({
	node,
}: {
	node: PmNode & { attrs: Record<string, unknown> }
}) {
	const jobId = node.attrs.jobId as string | null
	const text = node.textContent

	// Debounced auto-save — fires whenever the text content settles.
	// Skip the initial mount (when the text equals what's already in the DB).
	const isFirstRender = useRef(true)
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	useEffect(() => {
		if (isFirstRender.current) {
			isFirstRender.current = false
			return
		}
		if (!jobId) return

		if (timerRef.current) clearTimeout(timerRef.current)
		timerRef.current = setTimeout(() => {
			void updateExaminerSummary(jobId, text)
		}, SAVE_DEBOUNCE_MS)

		return () => {
			if (timerRef.current) clearTimeout(timerRef.current)
		}
	}, [jobId, text])

	return (
		<NodeViewWrapper className="py-4 border-b border-dashed border-zinc-200 dark:border-zinc-700 last:border-0">
			<span
				contentEditable={false}
				className="font-mono text-xs font-bold tracking-widest uppercase text-zinc-400 dark:text-zinc-500 block mb-2 select-none"
			>
				Examiner Summary
			</span>
			<NodeViewContent className="text-sm leading-relaxed whitespace-pre-wrap" />
		</NodeViewWrapper>
	)
}
