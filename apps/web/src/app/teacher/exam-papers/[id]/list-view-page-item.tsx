"use client"

import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { motion } from "framer-motion"
import { FileText, GripVertical, X } from "lucide-react"
import { useState } from "react"
import { createPortal } from "react-dom"
import { type MagnifierAnchor, PageMagnifier } from "./page-magnifier"

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

	const [magnifier, setMagnifier] = useState<MagnifierAnchor | null>(null)

	function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
		if (isDragging || !url) return
		// Use the first child (the thumbnail button) as the reference rect so
		// the cursor percentages are relative to the image, not the whole wrapper.
		const img = e.currentTarget.querySelector("img")
		const rect = img
			? img.getBoundingClientRect()
			: e.currentTarget.getBoundingClientRect()
		setMagnifier({
			xPct: Math.max(
				0,
				Math.min(100, ((e.clientX - rect.left) / rect.width) * 100),
			),
			yPct: Math.max(
				0,
				Math.min(100, ((e.clientY - rect.top) / rect.height) * 100),
			),
			rect,
		})
	}

	function handleMouseLeave() {
		setMagnifier(null)
	}

	return (
		<motion.div
			ref={setNodeRef}
			style={style}
			layout
			{...attributes}
			onMouseMove={handleMouseMove}
			onMouseLeave={handleMouseLeave}
			className={`relative group/page rounded-md overflow-hidden w-fit select-none ${
				isDragging ? "opacity-40" : ""
			}`}
		>
			{/* Thumbnail — drag handle + lightbox */}
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
						className="w-50 h-70.75 object-cover rounded-md border-2 border-foreground/20 dark:border-border"
					/>
				) : (
					<div className="w-50 h-70.75 flex items-center justify-center bg-muted/40 rounded-md border-2 border-foreground/20 dark:border-border">
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

			{/* Magnifier — rendered in a portal so it's never clipped by overflow:hidden parents */}
			{magnifier &&
				url &&
				createPortal(
					<PageMagnifier url={url} anchor={magnifier} />,
					document.body,
				)}
		</motion.div>
	)
}
