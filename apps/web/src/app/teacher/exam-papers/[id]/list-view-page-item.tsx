"use client"

import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { motion } from "framer-motion"
import { FileText, GripVertical, X } from "lucide-react"

type ListViewPageItemProps = {
	pageKey: string
	url: string | undefined
	index: number
	onLightbox: () => void
	onDelete: () => void
}

export function ListViewPageItem({
	pageKey,
	url,
	index,
	onLightbox,
	onDelete,
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
			className={`relative group/page rounded-md overflow-hidden w-fit select-none ${
				isDragging ? "opacity-40" : ""
			}`}
		>
			{/* Thumbnail — drag handle + lightbox in one target */}
			<button
				type="button"
				{...listeners}
				onClick={url ? onLightbox : undefined}
				className="block cursor-grab active:cursor-grabbing touch-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-md"
				aria-label={`Page ${index + 1} — drag to reorder`}
			>
				{url ? (
					// eslint-disable-next-line @next/next/no-img-element
					<img
						src={url}
						alt={`Page ${index + 1}`}
						draggable={false}
						loading="lazy"
						className="w-[200px] h-[283px] object-cover rounded-md border-2 border-foreground/20 dark:border-border"
					/>
				) : (
					<div className="w-[200px] h-[283px] flex items-center justify-center bg-muted/40 rounded-md border-2 border-foreground/20 dark:border-border">
						<FileText className="h-8 w-8 text-muted-foreground/30" />
					</div>
				)}
			</button>

			{/* Page number — bottom-left, always visible */}
			<div className="absolute bottom-1.5 left-1.5 rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-white font-medium tabular-nums pointer-events-none select-none">
				{index + 1}
			</div>

			{/* Grip hint — top-left, appears on hover */}
			<div className="absolute top-1.5 left-1.5 pointer-events-none opacity-0 group-hover/page:opacity-100 transition-opacity">
				<GripVertical className="h-4 w-4 text-white drop-shadow-sm" />
			</div>

			{/* Delete — top-right, appears on hover */}
			<button
				type="button"
				onClick={onDelete}
				className="absolute top-1.5 right-1.5 z-10 flex items-center justify-center h-6 w-6 rounded-full bg-black/50 text-white opacity-0 group-hover/page:opacity-100 transition-all duration-150 hover:bg-destructive"
				title="Delete page"
			>
				<X className="h-3 w-3" />
			</button>
		</motion.div>
	)
}
