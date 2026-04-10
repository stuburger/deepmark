"use client"

import { Switch } from "@/components/ui/switch"
import type { MarkPointCorrection, MarkPointResult } from "@/lib/marking/types"
import { cn } from "@/lib/utils"
import { Check, X } from "lucide-react"

export function MarkPointCorrections({
	markPointsResults,
	corrections,
	onChange,
}: {
	markPointsResults: MarkPointResult[]
	corrections: MarkPointCorrection[] | null
	onChange: (corrections: MarkPointCorrection[]) => void
}) {
	if (markPointsResults.length === 0) return null

	const correctionMap = new Map(
		(corrections ?? []).map((c) => [c.point, c.awarded]),
	)

	function togglePoint(pointNumber: number, aiAwarded: boolean) {
		const current = correctionMap.get(pointNumber)
		const newCorrections = [...(corrections ?? [])]

		if (current !== undefined) {
			// Remove correction (revert to AI)
			onChange(newCorrections.filter((c) => c.point !== pointNumber))
		} else {
			// Add correction (disagree with AI)
			onChange([
				...newCorrections,
				{ point: pointNumber, awarded: !aiAwarded },
			])
		}
	}

	return (
		<div className="space-y-2">
			<p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
				Mark Points
			</p>
			<div className="rounded-md border divide-y">
				{markPointsResults.map((mp) => {
					const correction = correctionMap.get(mp.pointNumber)
					const effectiveAwarded =
						correction !== undefined ? correction : mp.awarded
					const isCorrected = correction !== undefined

					return (
						<div
							key={mp.pointNumber}
							className={cn(
								"flex items-start gap-3 px-3 py-2",
								isCorrected && "bg-blue-50/50 dark:bg-blue-950/20",
							)}
						>
							{/* Verdict icon */}
							<div className="pt-0.5 shrink-0">
								{effectiveAwarded ? (
									<Check className="h-3.5 w-3.5 text-green-500" />
								) : (
									<X className="h-3.5 w-3.5 text-red-500" />
								)}
							</div>

							{/* Criteria */}
							<div className="flex-1 min-w-0">
								<p className="text-xs leading-snug">{mp.expectedCriteria}</p>
								{isCorrected && (
									<p className="text-[10px] text-blue-500 mt-0.5">
										Teacher corrected
									</p>
								)}
							</div>

							{/* Toggle */}
							<Switch
								checked={effectiveAwarded}
								onCheckedChange={() =>
									togglePoint(mp.pointNumber, mp.awarded)
								}
								className="shrink-0 scale-75"
							/>
						</div>
					)
				})}
			</div>
			<p className="text-[10px] text-muted-foreground">
				Corrections are informational — set the score separately above.
			</p>
		</div>
	)
}
