"use client"

import { useDraggable, useDroppable } from "@dnd-kit/core"
import { FileText, GripVertical } from "lucide-react"
import { useCallback } from "react"

export function DraggablePageThumb({
	pageKey,
	url,
	index,
	isDragging,
	onLightbox,
}: {
	pageKey: string
	url: string | undefined
	index: number
	isDragging: boolean
	onLightbox: () => void
}) {
	const {
		attributes,
		listeners,
		setNodeRef: setDragRef,
	} = useDraggable({ id: pageKey })
	const { setNodeRef: setDropRef, isOver } = useDroppable({ id: pageKey })

	const setRef = useCallback(
		(el: HTMLElement | null) => {
			setDragRef(el)
			setDropRef(el)
		},
		[setDragRef, setDropRef],
	)

	return (
		<div
			ref={setRef}
			className={`relative group shrink-0 rounded overflow-hidden border bg-muted/40 transition-all ${
				isDragging ? "opacity-40" : ""
			} ${isOver && !isDragging ? "ring-2 ring-primary scale-105" : ""}`}
		>
			{/* Drag handle */}
			<div
				{...listeners}
				{...attributes}
				className="absolute inset-x-0 top-0 h-4 flex items-center justify-center cursor-grab active:cursor-grabbing bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity z-10"
				title="Drag to reorder or move to another script"
			>
				<GripVertical className="h-3 w-3 text-white" />
			</div>

			<button
				type="button"
				onClick={onLightbox}
				disabled={!url}
				className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
				title={`Page ${index + 1} — click to enlarge`}
			>
				{url ? (
					// eslint-disable-next-line @next/next/no-img-element
					<img
						src={url}
						alt={`Page ${index + 1}`}
						draggable={false}
						className="w-14 h-20 object-cover"
					/>
				) : (
					<div className="w-14 h-20 flex items-center justify-center">
						<FileText className="h-5 w-5 text-muted-foreground/40" />
					</div>
				)}
			</button>

			<span className="absolute bottom-0.5 right-0.5 text-[9px] leading-none px-0.5 py-px rounded bg-black/50 text-white tabular-nums pointer-events-none">
				{index + 1}
			</span>
		</div>
	)
}
