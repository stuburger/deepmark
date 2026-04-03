"use client"

import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import type { BatchIngestJobData } from "@/lib/batch/types"
import { useDroppable } from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { AnimatePresence, motion } from "framer-motion"
import { Lock, LockOpen, Trash2, X } from "lucide-react"
import { ListViewLockedStack } from "./list-view-locked-stack"
import { ListViewPageItem } from "./list-view-page-item"

type ListViewScriptSectionProps = {
	script: BatchIngestJobData["staged_scripts"][number]
	localName: string
	urls: Record<string, string>
	isLocked: boolean
	onToggleLock: () => void
	onOpenCarousel: (
		script: BatchIngestJobData["staged_scripts"][number],
		index: number,
	) => void
	onUpdateLocalName: (value: string) => void
	onUpdateName: (name: string) => void
	onToggleExclude: () => void
	onDelete: () => void
}

function confidenceColor(confidence: number | null): string {
	if (confidence === null) return "secondary"
	if (confidence >= 0.9) return "default"
	if (confidence >= 0.7) return "outline"
	return "destructive"
}

function confidenceLabel(confidence: number | null): string {
	if (confidence === null) return "—"
	return (Math.round(confidence * 10) / 10).toFixed(1)
}

export function ListViewScriptSection({
	script,
	localName,
	urls,
	isLocked,
	onToggleLock,
	onOpenCarousel,
	onUpdateLocalName,
	onUpdateName,
	onToggleExclude,
	onDelete,
}: ListViewScriptSectionProps) {
	const pageKeys = script.page_keys.slice().sort((a, b) => a.order - b.order)

	const pageKeyIds = pageKeys.map((pk) => pk.s3_key)

	const { setNodeRef, isOver } = useDroppable({ id: script.id })

	const isExcluded = script.status === "excluded"

	return (
		<div className={`space-y-3 ${isExcluded ? "opacity-50" : ""}`}>
			{/* Section header */}
			<div className="flex items-center gap-3 sticky top-0 z-10 bg-background/95 backdrop-blur py-2 -my-2">
				<div className="flex-1 min-w-0">
					<Input
						value={localName}
						onChange={(e) => onUpdateLocalName(e.target.value)}
						onBlur={() => onUpdateName(localName)}
						placeholder="Student name"
						className="h-8 text-sm font-medium max-w-[280px]"
						disabled={isExcluded}
					/>
				</div>

				<div className="flex items-center gap-2 shrink-0">
					<Badge
						variant={
							confidenceColor(script.confidence) as
								| "default"
								| "destructive"
								| "outline"
								| "secondary"
						}
					>
						{confidenceLabel(script.confidence)}
					</Badge>
					<Badge
						variant={
							script.status === "confirmed"
								? "default"
								: isExcluded
									? "destructive"
									: "secondary"
						}
					>
						{script.status}
					</Badge>

					{/* Lock toggle */}
					{!isExcluded && (
						<button
							type="button"
							onClick={onToggleLock}
							className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
							title={isLocked ? "Unlock pages" : "Lock pages"}
						>
							{isLocked ? (
								<>
									<LockOpen className="h-3.5 w-3.5" />
									Unlock
								</>
							) : (
								<>
									<Lock className="h-3.5 w-3.5" />
									Lock
								</>
							)}
						</button>
					)}

					<button
						type="button"
						onClick={onToggleExclude}
						className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
					>
						<X className="h-3 w-3" />
						{isExcluded ? "Restore" : "Exclude"}
					</button>
					<button
						type="button"
						onClick={onDelete}
						className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
					>
						<Trash2 className="h-3 w-3" />
						Delete
					</button>
				</div>
			</div>

			{/* Pages — locked stack or sortable list */}
			<AnimatePresence mode="wait">
				{isLocked ? (
					<motion.div
						key="locked"
						initial={{ opacity: 0, scale: 0.95 }}
						animate={{ opacity: 1, scale: 1 }}
						exit={{ opacity: 0, scale: 0.95 }}
						transition={{ duration: 0.25 }}
					>
						<ListViewLockedStack
							pageKeys={pageKeys}
							urls={urls}
							onUnlock={onToggleLock}
							onOpenCarousel={() => onOpenCarousel(script, 0)}
						/>
					</motion.div>
				) : (
					<motion.div
						key="unlocked"
						ref={setNodeRef}
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.2 }}
						className={`space-y-2 rounded-lg p-2 -m-2 transition-colors ${
							isOver ? "ring-2 ring-primary/30 bg-primary/5" : ""
						}`}
					>
						<SortableContext
							id={script.id}
							items={pageKeyIds}
							strategy={verticalListSortingStrategy}
						>
							{pageKeys.length === 0 ? (
								<div className="flex items-center justify-center h-20 rounded-lg border-2 border-dashed text-xs text-muted-foreground">
									{isOver ? "Drop here" : "No pages"}
								</div>
							) : (
								pageKeys.map((pk, idx) => (
									<ListViewPageItem
										key={pk.s3_key}
										pageKey={pk.s3_key}
										url={urls[pk.s3_key]}
										index={idx}
										onLightbox={() => onOpenCarousel(script, idx)}
									/>
								))
							)}
						</SortableContext>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	)
}
