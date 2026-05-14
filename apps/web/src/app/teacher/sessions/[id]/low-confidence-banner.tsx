"use client"

import { Button } from "@/components/ui/button"
import { AlertCircle, X } from "lucide-react"
import { useState } from "react"

/**
 * Soft-nudge banner shown at the top of the completed-state summary when
 * one or more confirmed staged_scripts fell below the confidence threshold.
 * Dismissable for the current mount (not persisted).
 */
export function LowConfidenceBanner({
	count,
	onReview,
}: {
	count: number
	onReview?: () => void
}) {
	const [dismissed, setDismissed] = useState(false)
	if (dismissed || count === 0) return null
	return (
		<div className="flex items-start justify-between gap-3 rounded-md border border-warning/30 bg-warning-50 px-3 py-2">
			<div className="flex items-start gap-2">
				<AlertCircle aria-hidden className="mt-0.5 size-4 text-warning" />
				<p className="text-sm text-warning-800">
					{count === 1
						? "1 segment looked uncertain — worth a quick eyeball before marking."
						: `${count} segments looked uncertain — worth a quick eyeball before marking.`}
				</p>
			</div>
			<div className="flex items-center gap-1">
				{onReview && (
					<Button variant="ghost" size="sm" onClick={onReview}>
						Review
					</Button>
				)}
				<Button
					variant="ghost"
					size="icon-xs"
					onClick={() => setDismissed(true)}
					aria-label="Dismiss"
				>
					<X className="size-3.5" />
				</Button>
			</div>
		</div>
	)
}
