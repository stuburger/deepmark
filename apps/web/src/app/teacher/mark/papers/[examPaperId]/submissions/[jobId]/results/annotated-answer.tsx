"use client"

import {
	type TextMark,
	type TextSegment,
	splitIntoSegments,
} from "@/lib/marking/token-alignment"
import { cn } from "@/lib/utils"
import { useMemo } from "react"

// ─── AO tag colours (matches tag-overlay.tsx) ───────────────────────────────

const AO_TAG_CLASSES: Record<string, string> = {
	AO1: "border-blue-400 text-blue-600 bg-blue-50 dark:border-blue-500 dark:text-blue-400 dark:bg-blue-950/40",
	AO2: "border-pink-400 text-pink-600 bg-pink-50 dark:border-pink-500 dark:text-pink-400 dark:bg-pink-950/40",
	AO3: "border-green-400 text-green-600 bg-green-50 dark:border-green-500 dark:text-green-400 dark:bg-green-950/40",
}
const AO_TAG_FALLBACK =
	"border-zinc-300 text-zinc-600 bg-zinc-50 dark:border-zinc-500 dark:text-zinc-400 dark:bg-zinc-800/40"

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
		case "ao_tag":
			return "" // tags render as trailing pills, not span styling
		default:
			return ""
	}
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

	// Separate tag marks (render as trailing pills) from inline marks (render as span styles)
	const inlineMarks = marks.filter((m) => m.type !== "ao_tag")
	const tagMarks = marks.filter((m) => m.type === "ao_tag")

	// Compute leading symbols
	const symbols: Array<{ char: string; className: string }> = []
	for (const m of inlineMarks) {
		if (m.type === "tick")
			symbols.push({ char: "\u2713", className: "text-green-500" })
		if (m.type === "cross")
			symbols.push({ char: "\u2717", className: "text-red-500" })
	}

	// Merge class names and find first title
	const classes = inlineMarks.map(markClasses).filter(Boolean).join(" ")
	const title = inlineMarks.map(markTitle).find(Boolean)

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
			{tagMarks.map((tm) => {
				const display = (tm.attrs.display as string) ?? "?"
				const colorClass = AO_TAG_CLASSES[display] ?? AO_TAG_FALLBACK
				return (
					<span
						key={tm.annotationId}
						className={cn(
							"inline-flex items-center rounded border px-1 py-0 text-[10px] font-semibold ml-0.5 align-super leading-none",
							colorClass,
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
