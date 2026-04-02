"use client"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type { BatchIngestJobData } from "@/lib/batch/types"
import { useDroppable } from "@dnd-kit/core"
import { Trash2, X } from "lucide-react"
import { DraggablePageThumb } from "./draggable-page-thumb"

export type PageKeyRaw = {
	s3_key: string
	order: number
	mime_type: string
	source_file: string
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

export function DndScriptCard({
	script,
	localNames,
	urls,
	activeDragKey,
	onOpenCarousel,
	onUpdateLocalName,
	onUpdateName,
	onToggleExclude,
	onDelete,
}: {
	script: BatchIngestJobData["staged_scripts"][number]
	localNames: Record<string, string>
	urls: Record<string, string>
	activeDragKey: string | null
	onOpenCarousel: (
		script: BatchIngestJobData["staged_scripts"][number],
		idx: number,
	) => void
	onUpdateLocalName: (id: string, value: string) => void
	onUpdateName: (id: string, name: string) => void
	onToggleExclude: (id: string, status: string) => void
	onDelete: (id: string) => void
}) {
	const { setNodeRef, isOver } = useDroppable({ id: script.id })

	const pageKeys = (script.page_keys as PageKeyRaw[])
		.slice()
		.sort((a, b) => a.order - b.order)

	const isDraggingOtherSource =
		activeDragKey !== null &&
		!pageKeys.some((pk) => pk.s3_key === activeDragKey)

	return (
		<Card className={script.status === "excluded" ? "opacity-50" : undefined}>
			<CardContent className="p-4 space-y-3">
				<div className="space-y-1">
					<p className="text-xs text-muted-foreground">Student name</p>
					<Input
						value={localNames[script.id] ?? ""}
						onChange={(e) => onUpdateLocalName(script.id, e.target.value)}
						onBlur={() => onUpdateName(script.id, localNames[script.id] ?? "")}
						placeholder="Enter student name"
						className="h-8 text-sm"
						disabled={script.status === "excluded"}
					/>
				</div>

				<div className="flex items-center justify-between gap-2">
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
								: script.status === "excluded"
									? "destructive"
									: "secondary"
						}
					>
						{script.status}
					</Badge>
				</div>

				{/* ── Page thumbnails — droppable zone ── */}
				<div
					ref={setNodeRef}
					className={`flex gap-1.5 overflow-x-auto pb-0.5 -mx-0.5 px-0.5 min-h-21 rounded-lg transition-colors ${
						isOver && isDraggingOtherSource
							? "ring-2 ring-primary/30 bg-primary/5"
							: ""
					}`}
				>
					{pageKeys.length === 0 ? (
						<div
							className={`flex items-center justify-center w-full h-20 rounded-lg border-2 border-dashed text-xs text-muted-foreground ${
								isOver && isDraggingOtherSource
									? "border-primary text-primary"
									: "border-muted"
							}`}
						>
							{isOver && isDraggingOtherSource ? "Drop here" : "No pages"}
						</div>
					) : (
						<>
							{pageKeys.map((pk, idx) => (
								<DraggablePageThumb
									key={pk.s3_key}
									pageKey={pk.s3_key}
									url={urls[pk.s3_key]}
									index={idx}
									isDragging={activeDragKey === pk.s3_key}
									onLightbox={() => onOpenCarousel(script, idx)}
								/>
							))}
							{!pageKeys.some((pk) => urls[pk.s3_key]) && (
								<p className="text-xs text-muted-foreground self-center pl-1">
									Loading…
								</p>
							)}
						</>
					)}
				</div>

				<div className="flex items-center justify-between text-xs text-muted-foreground">
					<span>
						{pageKeys.length} page{pageKeys.length === 1 ? "" : "s"}
					</span>
					<div className="flex items-center gap-3">
						<button
							type="button"
							onClick={() => onToggleExclude(script.id, script.status)}
							className="flex items-center gap-1 hover:text-foreground transition-colors"
						>
							<X className="h-3 w-3" />
							{script.status === "excluded" ? "Restore" : "Exclude"}
						</button>
						<button
							type="button"
							onClick={() => onDelete(script.id)}
							className="flex items-center gap-1 hover:text-destructive transition-colors"
						>
							<Trash2 className="h-3 w-3" />
							Delete
						</button>
					</div>
				</div>
			</CardContent>
		</Card>
	)
}
