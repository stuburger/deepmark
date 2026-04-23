"use client"

import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { ChevronDown, FileText } from "lucide-react"
import { useState } from "react"

/**
 * Shared "Show attached content" collapsible. Used in:
 *  - the exam-paper editor (per question)
 *  - the submission results view (per question inside the Prosemirror
 *    question-answer node view)
 *
 * NOTE: assumes `content` is plain text / markdown. When image or table
 * stimuli land, this component will need branches per content_type.
 */
export function StimulusDisclosure({
	stimuli,
	size = "sm",
}: {
	stimuli: Array<{ label: string; content: string }>
	/** "sm" matches question-list density; "xs" for inline-in-editor density. */
	size?: "sm" | "xs"
}) {
	const [open, setOpen] = useState(false)
	if (stimuli.length === 0) return null

	const labels = stimuli.map((s) => s.label).join(", ")
	const triggerText = `${open ? "Hide" : "Show"} attached content`

	return (
		<Collapsible open={open} onOpenChange={setOpen} className="mb-2">
			<CollapsibleTrigger
				className={[
					"inline-flex items-center gap-1.5 rounded-md",
					size === "xs" ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-1 text-xs",
					"font-medium",
					"bg-amber-50 text-amber-800 hover:bg-amber-100",
					"dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-950/60",
					"border border-amber-200 dark:border-amber-900",
					"transition-colors",
				].join(" ")}
			>
				<FileText className="h-3 w-3" aria-hidden />
				<span>
					{triggerText}
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
