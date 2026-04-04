"use client"

import { Badge } from "@/components/ui/badge"
import { motion } from "framer-motion"
import { FileText, Undo2 } from "lucide-react"

type ListViewLockedStackProps = {
	pageKeys: Array<{ s3_key: string; order: number }>
	urls: Record<string, string>
	onUnlock: () => void
	onOpenCarousel: () => void
	showUndo?: boolean
	showPageCount?: boolean
}

const MAX_VISIBLE_PAGES = 5

export function ListViewLockedStack({
	pageKeys,
	urls,
	onUnlock,
	onOpenCarousel,
	showUndo = true,
	showPageCount = true,
}: ListViewLockedStackProps) {
	const sorted = pageKeys.slice().sort((a, b) => a.order - b.order)
	const visible = sorted.slice(0, MAX_VISIBLE_PAGES)
	const total = sorted.length
	const mid = (visible.length - 1) / 2

	return (
		<motion.div
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			className="group relative"
		>
			{/* Stack container */}
			<button
				type="button"
				onClick={onOpenCarousel}
				className="relative block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				style={{
					width: 200 + (visible.length - 1) * 1.5 + 16,
					height: 283 + (visible.length - 1) * 3 + 16,
				}}
			>
				{visible.map((pk, index) => {
					const url = urls[pk.s3_key]
					const rotation = (index - mid) * 0.4
					const zIndex = total - index

					return (
						<motion.div
							key={pk.s3_key}
							initial={{ y: index * 40, opacity: 0 }}
							animate={{
								x: index * 1.5,
								y: index * 3,
								rotate: rotation,
								opacity: 1,
							}}
							transition={{
								type: "spring",
								stiffness: 300,
								damping: 25,
								delay: index * 0.03,
							}}
							className="absolute top-2 left-2 w-[200px] h-[283px] rounded-md border bg-card overflow-hidden"
							style={{
								zIndex,
								boxShadow: `0 ${1 + index}px ${2 + index * 2}px rgba(0,0,0,0.08)`,
							}}
						>
							{url ? (
								// eslint-disable-next-line @next/next/no-img-element
								<img
									src={url}
									alt={`Page ${index + 1}`}
									draggable={false}
									loading="lazy"
									className="w-full h-full object-cover"
								/>
							) : (
								<div className="w-full h-full flex items-center justify-center bg-muted/40">
									<FileText className="h-8 w-8 text-muted-foreground/30" />
								</div>
							)}
						</motion.div>
					)
				})}
			</button>

			{/* Page count badge */}
			{showPageCount && (
				<Badge
					variant="secondary"
					className="absolute bottom-3 right-3 pointer-events-none tabular-nums"
				>
					{total} {total === 1 ? "page" : "pages"}
				</Badge>
			)}

			{/* Undo button — visible on hover */}
			{showUndo && (
				<button
					type="button"
					onClick={onUnlock}
					className="absolute top-3 right-3 flex items-center gap-1.5 rounded-md bg-background/90 backdrop-blur border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
				>
					<Undo2 className="h-3.5 w-3.5" />
					Undo
				</button>
			)}
		</motion.div>
	)
}
