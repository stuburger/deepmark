"use client"

import { ChevronDown, ChevronUp } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import type { DashboardPaper } from "@/lib/dashboard/types"

import {
	DashboardEmptyCardSlot,
	DashboardPaperCard,
} from "./dashboard-paper-card"

const INITIAL_VISIBLE = 6

export function RecentBatchesGrid({ papers }: { papers: DashboardPaper[] }) {
	const [expanded, setExpanded] = useState(false)
	const visible = expanded ? papers : papers.slice(0, INITIAL_VISIBLE)
	const slotCount = Math.max(3, Math.ceil(visible.length / 3) * 3)
	const emptySlotCount = Math.max(0, slotCount - visible.length)
	const hiddenCount = papers.length - INITIAL_VISIBLE

	return (
		<>
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{visible.map((paper) => (
					<DashboardPaperCard key={paper.id} paper={paper} />
				))}
				{Array.from({ length: emptySlotCount }, (_, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: empty slots have no identity
					<DashboardEmptyCardSlot key={`empty-${i}`} />
				))}
			</div>
			{hiddenCount > 0 && (
				<div className="mt-4 flex justify-center">
					<Button
						variant="ghost"
						size="sm"
						onClick={() => setExpanded((e) => !e)}
						className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-tertiary hover:text-foreground"
					>
						{expanded ? <ChevronUp /> : <ChevronDown />}
						{expanded ? "Show less" : `Show ${hiddenCount} more`}
					</Button>
				</div>
			)}
		</>
	)
}
