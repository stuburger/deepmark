"use client"

import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import type { SubmissionHistoryItem } from "@/lib/marking/types"
import type { BoundaryMode, GradeBoundary } from "@mcp-gcse/shared"

type Point = {
	id: string
	name: string
	awarded: number
	max: number
	percent: number
}

export function ScoreDistribution({
	submissions,
	boundaries,
	boundaryMode,
	paperTotal,
}: {
	submissions: SubmissionHistoryItem[]
	boundaries: GradeBoundary[] | null
	boundaryMode: BoundaryMode | null
	paperTotal: number
}) {
	const points: Point[] = submissions.map((s) => ({
		id: s.id,
		name: s.student_name ?? "Unnamed",
		awarded: s.total_awarded,
		max: s.total_max,
		percent: Math.round((s.total_awarded / s.total_max) * 100),
	}))

	// Convert each boundary to a percent on the rail. In raw mode we divide by
	// paperTotal; in percent mode the value is already a percentage.
	const boundaryPercents =
		boundaries && boundaryMode
			? boundaries
					.map((b) => ({
						grade: b.grade,
						percent:
							boundaryMode === "raw"
								? Math.min(
										100,
										Math.max(0, (b.min_mark / Math.max(paperTotal, 1)) * 100),
									)
								: Math.min(100, Math.max(0, b.min_mark)),
					}))
					.sort((a, b) => a.percent - b.percent)
			: []

	// Bucket dots by 1% bins so vertical stacking communicates density. Stacking
	// upward off the rail keeps overlapping submissions distinguishable.
	const binSize = 2
	const buckets = new Map<number, Point[]>()
	for (const p of points) {
		const bin = Math.floor(p.percent / binSize) * binSize
		const arr = buckets.get(bin) ?? []
		arr.push(p)
		buckets.set(bin, arr)
	}

	const maxStack = Math.max(1, ...Array.from(buckets.values(), (v) => v.length))
	const dotSize = 12
	const dotGap = 2
	const stackHeight = maxStack * (dotSize + dotGap)
	const railHeight = stackHeight + 36 // room for grade labels at top + axis at bottom

	return (
		<TooltipProvider>
			<div className="px-2 pt-2 pb-1">
				<div className="relative w-full" style={{ height: `${railHeight}px` }}>
					{/* Grade boundary vertical lines */}
					{boundaryPercents.map((b) => (
						<div
							key={b.grade}
							className="absolute top-0 bottom-6 border-l border-dashed border-foreground/20"
							style={{ left: `${b.percent}%` }}
						>
							<span className="absolute -top-0.5 -translate-x-1/2 text-[10px] font-medium text-muted-foreground tabular-nums bg-background px-1">
								{b.grade}
							</span>
						</div>
					))}

					{/* Track */}
					<div
						className="absolute inset-x-0 h-1.5 rounded-full bg-gradient-to-r from-red-500/20 via-amber-500/25 to-emerald-500/35"
						style={{ bottom: "24px" }}
					/>

					{/* Stacked dots */}
					{Array.from(buckets.entries()).map(([bin, bucket]) => {
						const center = bin + binSize / 2
						return bucket.map((p, idx) => {
							// Stack upward from the track; idx 0 sits just above the rail.
							const offsetY = idx * (dotSize + dotGap) + 6
							return (
								<Tooltip key={p.id}>
									<TooltipTrigger
										className="absolute -translate-x-1/2 rounded-full bg-foreground/80 hover:bg-primary hover:scale-125 transition-all cursor-default ring-1 ring-background"
										style={{
											left: `${center}%`,
											bottom: `${24 + offsetY}px`,
											width: `${dotSize}px`,
											height: `${dotSize}px`,
										}}
									/>
									<TooltipContent>
										<div className="text-xs">
											<div className="font-medium">{p.name}</div>
											<div className="tabular-nums text-muted-foreground">
												{p.awarded}/{p.max} ({p.percent}%)
											</div>
										</div>
									</TooltipContent>
								</Tooltip>
							)
						})
					})}

					{/* Axis labels */}
					<div className="absolute left-0 right-0 bottom-0 flex justify-between text-[10px] text-muted-foreground tabular-nums">
						<span>0%</span>
						<span>50%</span>
						<span>100%</span>
					</div>
				</div>
			</div>
		</TooltipProvider>
	)
}
