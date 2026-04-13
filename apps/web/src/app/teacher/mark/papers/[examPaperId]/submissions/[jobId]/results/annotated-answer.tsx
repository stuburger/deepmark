"use client"

import { aoLabel, aoPillClass } from "@/lib/marking/ao-palette"
import {
	type TextMark,
	type TextSegment,
	splitIntoSegments,
} from "@/lib/marking/token-alignment"
import { cn } from "@/lib/utils"
import { useMemo } from "react"

// ─── Mark styling ───────────────────────────────────────────────────────────

function markClasses(mark: TextMark): string {
	switch (mark.type) {
		case "tick":
			return "underline decoration-green-500 decoration-2 underline-offset-2"
		case "cross":
			return "underline decoration-red-500 decoration-2 underline-offset-2"
		case "underline":
			return "underline decoration-blue-500 decoration-2 underline-offset-2"
		case "double_underline":
			return "underline decoration-double decoration-green-600 decoration-2 underline-offset-2"
		case "box":
			return "ring-1 ring-purple-500 rounded-sm px-0.5"
		case "circle":
			return "ring-1 ring-amber-500 rounded-full px-0.5"
		case "chain": {
			const chainType = mark.attrs.chainType as string | undefined
			if (chainType === "evaluation")
				return "bg-amber-100/40 dark:bg-amber-900/20"
			if (chainType === "judgement")
				return "bg-violet-100/40 dark:bg-violet-900/20"
			return "bg-blue-100/40 dark:bg-blue-900/20"
		}
	}
	const _exhaustive: never = mark.type
	return ""
}

function markTitle(mark: TextMark): string | undefined {
	if (mark.attrs.reason) return mark.attrs.reason as string
	if (mark.attrs.phrase) return mark.attrs.phrase as string
	return undefined
}

// ─── Segment renderer ───────────────────────────────────────────────────────

function AnnotatedSpan({ segment }: { segment: TextSegment }) {
	const { text, marks } = segment
	if (marks.length === 0) return <>{text}</>

	const aoMarks = marks.filter((m) => m.attrs.ao_category)

	// Compute leading symbols
	const symbols: Array<{ char: string; className: string }> = []
	for (const m of marks) {
		if (m.type === "tick")
			symbols.push({ char: "\u2713", className: "text-green-500" })
		if (m.type === "cross")
			symbols.push({ char: "\u2717", className: "text-red-500" })
	}

	// Merge class names and find first title
	const classes = marks.map(markClasses).filter(Boolean).join(" ")
	const title = marks.map(markTitle).find(Boolean)

	return (
		<>
			{symbols.map((s, i) => (
				<span
					// biome-ignore lint/suspicious/noArrayIndexKey: stable ordered symbols
					key={i}
					className={cn("font-bold mr-0.5 text-xs", s.className)}
					aria-hidden
				>
					{s.char}
				</span>
			))}
			<span className={classes || undefined} title={title}>
				{text}
			</span>
			{aoMarks.map((tm) => {
				const display = aoLabel(tm.attrs)
				return (
					<span
						key={tm.annotationId}
						className={cn(
							"inline-flex items-center rounded border px-1 py-0 text-[10px] font-semibold ml-0.5 align-super leading-none",
							aoPillClass(display),
						)}
						title={tm.attrs.reason as string | undefined}
					>
						{display}
					</span>
				)
			})}
		</>
	)
}

// ─── Main component ─────────────────────────────────────────────────────────

export function AnnotatedAnswer({
	answer,
	marks,
}: {
	answer: string
	/** Pre-computed text marks from the shared alignment hook */
	marks: TextMark[]
}) {
	const segments = useMemo(
		() => splitIntoSegments(answer, marks),
		[answer, marks],
	)

	return (
		<div className="text-base whitespace-pre-wrap font-handwriting">
			{segments.map((seg, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: segments are stable derived data
				<AnnotatedSpan key={i} segment={seg} />
			))}
		</div>
	)
}
