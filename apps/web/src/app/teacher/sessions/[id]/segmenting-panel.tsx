"use client"

import { formatElapsedShort } from "@/lib/format/date"
import { FileText, Loader2 } from "lucide-react"

/**
 * In-progress segmentation panel. Lights up once the bundle handler has
 * promoted the paper but the batch is still classifying scripts.
 *
 * No progress strip yet — pages-processed events are available via
 * job_events but the segmenting panel reads cleaner with a single
 * indeterminate spinner. Add a deterministic strip once we have per-fixture
 * sense of how long the LLM step takes after Vision OCR finishes.
 */
export function SegmentingPanel({
	createdAt,
	scriptsFilename,
}: {
	createdAt: Date | string
	scriptsFilename: string | null
}) {
	return (
		<div className="space-y-6">
			<div className="space-y-2">
				<h1 className="text-2xl font-semibold text-foreground">
					Reading your scripts
				</h1>
				<p className="text-sm text-muted-foreground">
					We're scanning each page, splitting students out, and proposing names.
					This takes a moment — usually 1–2 minutes.
				</p>
			</div>

			<div className="rounded-lg border border-border bg-card p-4">
				<div className="flex items-center gap-3">
					<Loader2 className="size-5 animate-spin text-primary" />
					<div className="flex-1">
						<p className="text-sm font-medium text-foreground">
							Segmenting student scripts
						</p>
						<p className="mt-0.5 text-xs text-muted-foreground">
							{scriptsFilename ?? "Scripts PDF"} · started{" "}
							{formatElapsedShort(createdAt)} ago
						</p>
					</div>
				</div>
			</div>

			<div className="flex items-center gap-3 text-xs text-muted-foreground">
				<FileText className="size-3.5" />
				<span>
					You can close this tab — we'll keep working in the background.
				</span>
			</div>
		</div>
	)
}
