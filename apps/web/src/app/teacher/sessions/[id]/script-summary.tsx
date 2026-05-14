"use client"

import type { StagedScriptStatus } from "@mcp-gcse/db"
import { AlertTriangle, Check, EyeOff } from "lucide-react"
import Image from "next/image"

type Script = {
	id: string
	proposedName: string | null
	confirmedName: string | null
	status: StagedScriptStatus
	confidence: number | null
	isLowConfidence: boolean
	thumbnailUrl: string
}

/**
 * Wizard completed-state script list. One card per staged_script.
 * Read-only here — clicking a card or "Review / rearrange" opens the
 * shell's StagingReviewDialog which owns drag/split/rename/preview/exclude.
 */
export function ScriptSummary({
	scripts,
	onOpenReview,
}: {
	scripts: Script[]
	onOpenReview: () => void
}) {
	if (scripts.length === 0) {
		return (
			<p className="text-sm text-muted-foreground">
				Segmentation finished but no scripts were detected.
			</p>
		)
	}

	return (
		<ul className="grid gap-2 sm:grid-cols-2">
			{scripts.map((s) => {
				const name = s.confirmedName ?? s.proposedName ?? "Unnamed"
				const isExcluded = s.status === "excluded"
				return (
					<li
						key={s.id}
						className={`flex items-center gap-3 rounded-md border border-border bg-card p-3 transition-opacity ${
							isExcluded ? "opacity-50" : ""
						}`}
					>
						<button
							type="button"
							onClick={onOpenReview}
							className="flex items-center gap-3 text-left flex-1 min-w-0 group"
						>
							<div className="relative size-16 shrink-0 overflow-hidden rounded border border-border-quiet bg-muted">
								<Image
									src={s.thumbnailUrl}
									alt=""
									fill
									sizes="64px"
									className="object-cover"
									unoptimized
								/>
							</div>
							<div className="min-w-0 flex-1">
								<div className="flex items-center gap-2">
									<p className="truncate text-sm font-medium text-foreground group-hover:text-primary">
										{name}
									</p>
									{isExcluded && (
										<EyeOff
											aria-hidden
											className="size-3.5 text-muted-foreground"
										/>
									)}
								</div>
								<div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
									{s.isLowConfidence && !isExcluded ? (
										<span className="inline-flex items-center gap-1 rounded-sm bg-warning-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-warning-800">
											<AlertTriangle aria-hidden className="size-3" />
											Uncertain
										</span>
									) : !isExcluded ? (
										<span className="inline-flex items-center gap-1 text-success">
											<Check aria-hidden className="size-3" />
											Confident
										</span>
									) : (
										<span>Excluded</span>
									)}
								</div>
							</div>
						</button>
					</li>
				)
			})}
		</ul>
	)
}
