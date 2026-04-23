"use client"

import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible"
import type { GradingResult } from "@/lib/marking/types"
import { ChevronDown, FileText } from "lucide-react"
import { useMemo, useState } from "react"

/**
 * Paper-level collapsible banner of all case-study / source material
 * referenced by any question in the submission. Sits at the top of the
 * grading-results panel so teachers can read the stimulus while reviewing
 * any question's marks.
 *
 * Deduplicates by label — if Q1 and Q2 both reference "Item A", it's shown
 * once. Renders nothing when no question has stimuli.
 */
export function StimuliBanner({
	gradingResults,
}: {
	gradingResults: GradingResult[]
}) {
	const [open, setOpen] = useState(false)

	const stimuli = useMemo(() => {
		const byLabel = new Map<string, { label: string; content: string }>()
		for (const r of gradingResults) {
			for (const s of r.stimuli ?? []) {
				if (!byLabel.has(s.label)) byLabel.set(s.label, s)
			}
		}
		return [...byLabel.values()]
	}, [gradingResults])

	if (stimuli.length === 0) return null

	const labels = stimuli.map((s) => s.label).join(", ")

	return (
		<Collapsible open={open} onOpenChange={setOpen} className="px-1">
			<CollapsibleTrigger
				className={[
					"inline-flex items-center gap-1.5 rounded-md px-2 py-1",
					"text-xs font-medium",
					"bg-amber-50 text-amber-800 hover:bg-amber-100",
					"dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-950/60",
					"border border-amber-200 dark:border-amber-900",
					"transition-colors",
				].join(" ")}
			>
				<FileText className="h-3 w-3" aria-hidden />
				<span>
					{open ? "Hide" : "Show"} attached content
					<span className="font-normal opacity-75"> ({labels})</span>
				</span>
				<ChevronDown
					className={[
						"h-3 w-3 transition-transform",
						open ? "rotate-180" : "",
					].join(" ")}
					aria-hidden
				/>
			</CollapsibleTrigger>
			<CollapsibleContent className="mt-2 space-y-3">
				{stimuli.map((stim) => (
					<div
						key={stim.label}
						className={[
							"rounded-md border px-3 py-2",
							"bg-zinc-50/70 dark:bg-zinc-900/40",
							"border-zinc-200 dark:border-zinc-700",
						].join(" ")}
					>
						<div className="text-xs font-semibold text-zinc-700 dark:text-zinc-200 mb-1">
							{stim.label}
						</div>
						<div className="text-xs leading-relaxed text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">
							{stim.content}
						</div>
					</div>
				))}
			</CollapsibleContent>
		</Collapsible>
	)
}
