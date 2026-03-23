"use client"

import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover"
import type { HandwritingAnalysis } from "@/lib/handwriting-types"
import { FileText, StickyNote } from "lucide-react"

type Props = {
	analysis: HandwritingAnalysis
	className?: string
}

export function HandwritingAnalysisPanel({ analysis }: Props) {
	const observations = analysis.observations ?? []

	return (
		<div className="flex items-center gap-1">
			<Popover>
				<PopoverTrigger
					openOnHover
					delay={0}
					closeDelay={100}
					aria-label="View transcript"
					className="inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
				>
					<FileText className="h-4 w-4" />
				</PopoverTrigger>
				<PopoverContent
					side="bottom"
					sideOffset={6}
					className="w-80 max-h-64 overflow-y-auto"
				>
					<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
						Transcript
					</p>
					<p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
						{analysis.transcript || "—"}
					</p>
				</PopoverContent>
			</Popover>

			<Popover>
				<PopoverTrigger
					openOnHover
					delay={0}
					closeDelay={100}
					aria-label="View observations"
					className="inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
				>
					<StickyNote className="h-4 w-4" />
				</PopoverTrigger>
				<PopoverContent
					side="bottom"
					sideOffset={6}
					className="w-80 max-h-64 overflow-y-auto"
				>
					<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
						Observations
					</p>
					{observations.length > 0 ? (
						<ul className="list-inside list-disc space-y-1 text-sm leading-relaxed text-foreground">
							{observations.map((o, i) => (
								<li key={i}>{o}</li>
							))}
						</ul>
					) : (
						<p className="text-sm text-muted-foreground">—</p>
					)}
				</PopoverContent>
			</Popover>
		</div>
	)
}
