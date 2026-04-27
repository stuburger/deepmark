"use client"

import { cn } from "@/lib/utils"

/**
 * Renders `?/N` for a question that hasn't been graded yet — distinguishes
 * "AI hasn't returned a score" from a real `0/N`. White background + black
 * border so the visual reads as "unfilled" against the colored score badges.
 *
 * Two shapes:
 *   - `pill`  — rounded-full, used by the per-question score badge in
 *               `ScoreOverrideEditor` (Q-block header).
 *   - `rect`  — zero-radius rectangle, used inline in the MCQ grid where the
 *               row's other cells are also rectangular.
 */
export function UngradedBadge({
	maxScore,
	shape = "pill",
	className,
}: {
	maxScore: number
	shape?: "pill" | "rect"
	className?: string
}) {
	return (
		<span
			className={cn(
				"inline-flex items-center justify-center border border-zinc-900 bg-white text-zinc-900 font-semibold tabular-nums dark:border-zinc-100 dark:bg-zinc-950 dark:text-zinc-100",
				shape === "pill"
					? "gap-1 rounded-full px-2 py-0.5 text-xs"
					: "min-w-[2.5rem] rounded-sm px-1",
				className,
			)}
		>
			?/{maxScore}
		</span>
	)
}
