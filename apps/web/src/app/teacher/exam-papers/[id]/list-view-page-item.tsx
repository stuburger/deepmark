"use client"

import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { motion } from "framer-motion"
import { FileText, GripVertical } from "lucide-react"

type ListViewPageItemProps = {
	pageKey: string
	url: string | undefined
	index: number
	onLightbox: () => void
}

export function ListViewPageItem({
	pageKey,
	url,
	index,
	onLightbox,
}: ListViewPageItemProps) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: pageKey })

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
	}

	return (
		<motion.div
			ref={setNodeRef}
			style={style}
			layout
			{...attributes}
			className={`group flex items-start gap-3 rounded-lg border bg-card p-3 ${
				isDragging ? "opacity-40 shadow-lg" : ""
			}`}
		>
			{/* Drag handle */}
			<button
				type="button"
				{...listeners}
				className="shrink-0 mt-1 cursor-grab active:cursor-grabbing p-1 rounded text-muted-foreground/40 hover:text-muted-foreground transition-colors touch-none"
				aria-label="Drag to reorder or move to another student"
			>
				<GripVertical className="h-5 w-5" />
			</button>

			{/* Page thumbnail */}
			<button
				type="button"
				onClick={onLightbox}
				disabled={!url}
				className="shrink-0 rounded-md overflow-hidden border bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
			>
				{url ? (
					// eslint-disable-next-line @next/next/no-img-element
					<img
						src={url}
						alt={`Page ${index + 1}`}
						draggable={false}
						loading="lazy"
						className="w-[200px] h-[283px] object-cover"
					/>
				) : (
					<div className="w-[200px] h-[283px] flex items-center justify-center">
						<FileText className="h-8 w-8 text-muted-foreground/30" />
					</div>
				)}
			</button>

			{/* Metadata */}
			<div className="flex flex-col gap-1 pt-1">
				<span className="text-sm font-medium tabular-nums">
					Page {index + 1}
				</span>
			</div>
		</motion.div>
	)
}
