"use client"

import { Button } from "@/components/ui/button"
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet"
import type { HandwritingAnalysis } from "@/lib/scan-actions"
import { cn } from "@/lib/utils"
import { useState } from "react"

type Props = {
	analysis: HandwritingAnalysis
	className?: string
	/** When false, hides the “Full view” sheet trigger (e.g. inside the sheet body). */
	showFullViewButton?: boolean
	/** Uppercase section label; set false when nested inside BoundingBoxViewer. */
	showHeading?: boolean
}

function AnalysisCards({ analysis }: { analysis: HandwritingAnalysis }) {
	const observations = analysis.observations ?? []
	return (
		<div className="grid grid-cols-1 gap-4 @min-[28rem]/analysis:grid-cols-2">
			<div className="rounded-lg border bg-card p-4">
				<h3 className="mb-2 font-medium">Transcript</h3>
				<p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
					{analysis.transcript || "—"}
				</p>
			</div>
			<div className="rounded-lg border bg-card p-4">
				<h3 className="mb-2 font-medium">Observations</h3>
				{observations.length > 0 ? (
					<ul className="list-inside list-disc space-y-1 text-sm leading-relaxed text-muted-foreground">
						{observations.map((o, i) => (
							<li key={i}>{o}</li>
						))}
					</ul>
				) : (
					<p className="text-sm text-muted-foreground">—</p>
				)}
			</div>
		</div>
	)
}

export function HandwritingAnalysisPanel({
	analysis,
	className,
	showFullViewButton = true,
	showHeading = true,
}: Props) {
	const [sheetOpen, setSheetOpen] = useState(false)
	const hasContent =
		Boolean(analysis.transcript?.trim()) ||
		(analysis.observations ?? []).length > 0

	const fullViewControl =
		showFullViewButton && hasContent ? (
			<div className="flex shrink-0 items-center">
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="h-8 text-xs"
					onClick={() => setSheetOpen(true)}
				>
					Full view
				</Button>
				<Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
					<SheetContent
						side="right"
						className="w-full gap-0 overflow-y-auto sm:max-w-xl"
					>
						<SheetHeader className="border-b text-left">
							<SheetTitle>Transcript &amp; observations</SheetTitle>
						</SheetHeader>
						<div className="p-4 @container/analysis">
							<AnalysisCards analysis={analysis} />
						</div>
					</SheetContent>
				</Sheet>
			</div>
		) : null

	return (
		<div className={cn("@container/analysis", className)}>
			{showHeading ? (
				<div className="mb-3 flex items-start justify-between gap-3">
					<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
						OCR text &amp; notes
					</p>
					{fullViewControl}
				</div>
			) : fullViewControl ? (
				<div className="mb-2 flex justify-end">{fullViewControl}</div>
			) : null}
			<AnalysisCards analysis={analysis} />
		</div>
	)
}
