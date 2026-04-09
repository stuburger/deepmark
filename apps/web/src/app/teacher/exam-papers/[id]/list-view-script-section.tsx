"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { StagedScript } from "@/lib/batch/types"
import { useDroppable } from "@dnd-kit/core"
import { SortableContext, rectSortingStrategy } from "@dnd-kit/sortable"
import { CheckCircle2, Trash2 } from "lucide-react"
import { ListViewPageItem } from "./list-view-page-item"

type ListViewScriptSectionProps = {
	script: StagedScript
	localName: string
	urls: Record<string, string>
	onToggleInclude: () => void
	onOpenCarousel: (
		script: StagedScript,
		index: number,
	) => void
	onUpdateLocalName: (value: string) => void
	onUpdateName: (name: string) => void
	onDelete: () => void
	onDeletePage: (pageKey: string) => void
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
	onToggleInclude,
	onOpenCarousel,
	onUpdateLocalName,
	onUpdateName,
	onDelete,
	onDeletePage,
}: ListViewScriptSectionProps) {
	const pageKeys = script.page_keys.slice().sort((a, b) => a.order - b.order)
	const pageKeyIds = pageKeys.map((pk) => pk.s3_key)

	const { setNodeRef, isOver } = useDroppable({ id: script.id })

	return (
		<div className="space-y-3">
			{/* Section header */}
			<div className="flex items-center gap-3 sticky top-0 z-10 bg-background/95 backdrop-blur py-2 -my-2 border-b pb-3 mb-1">
				<div className="flex-1 min-w-0">
					<Input
						value={localName}
						onChange={(e) => onUpdateLocalName(e.target.value)}
						onBlur={() => onUpdateName(localName)}
						placeholder="Student name"
						className="h-8 text-sm font-medium max-w-[280px]"
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

					<Badge variant="secondary">Needs review</Badge>

					<Button
						size="sm"
						variant="default"
						className="h-7 px-2.5 text-xs gap-1"
						onClick={onToggleInclude}
					>
						<CheckCircle2 className="h-3.5 w-3.5" />
						Include
					</Button>

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

			{/* Sortable pages — tiled horizontally */}
			<div
				ref={setNodeRef}
				className={`rounded-lg transition-colors ${
					isOver ? "ring-2 ring-primary/30 bg-primary/5" : ""
				}`}
			>
				<SortableContext
					id={script.id}
					items={pageKeyIds}
					strategy={rectSortingStrategy}
				>
					{pageKeys.length === 0 ? (
						<div className="flex items-center justify-center h-20 rounded-lg border-2 border-dashed text-xs text-muted-foreground">
							{isOver ? "Drop here" : "No pages"}
						</div>
					) : (
						<div className="flex flex-wrap gap-2">
							{pageKeys.map((pk, idx) => (
								<ListViewPageItem
									key={pk.s3_key}
									pageKey={pk.s3_key}
									url={urls[pk.s3_key]}
									index={idx}
									onLightbox={() => onOpenCarousel(script, idx)}
									onDelete={() => onDeletePage(pk.s3_key)}
								/>
							))}
						</div>
					)}
				</SortableContext>
			</div>
		</div>
	)
}
