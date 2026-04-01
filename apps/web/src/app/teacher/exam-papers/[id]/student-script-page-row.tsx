"use client"

import { Spinner } from "@/components/ui/spinner"
import { ArrowDown, ArrowUp, FileText, Trash2 } from "lucide-react"

export type PageItem = {
	order: number
	name: string
	mimeType: string
	key: string
	uploading: boolean
	error: string | null
}

export function StudentScriptPageRow({
	page,
	index,
	totalPages,
	onMove,
	onRemove,
}: {
	page: PageItem
	index: number
	totalPages: number
	onMove: (order: number, direction: "up" | "down") => void
	onRemove: (order: number) => void
}) {
	return (
		<div className="flex items-center gap-2.5 rounded-lg border bg-muted/20 px-3 py-2">
			{page.uploading ? (
				<Spinner className="h-4 w-4 shrink-0 text-muted-foreground" />
			) : (
				<FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
			)}
			<div className="flex-1 min-w-0">
				<p className="text-sm truncate">{page.name}</p>
				{page.error ? (
					<p className="text-xs text-destructive">{page.error}</p>
				) : page.uploading ? (
					<p className="text-xs text-muted-foreground">Uploading…</p>
				) : (
					<p className="text-xs text-muted-foreground">Page {index + 1}</p>
				)}
			</div>
			{!page.uploading && totalPages > 1 && (
				<div className="flex flex-col gap-0.5 shrink-0">
					<button
						type="button"
						disabled={index === 0}
						onClick={() => onMove(page.order, "up")}
						className="p-1 rounded text-muted-foreground hover:bg-muted disabled:opacity-30"
						aria-label="Move page up"
					>
						<ArrowUp className="h-3 w-3" />
					</button>
					<button
						type="button"
						disabled={index === totalPages - 1}
						onClick={() => onMove(page.order, "down")}
						className="p-1 rounded text-muted-foreground hover:bg-muted disabled:opacity-30"
						aria-label="Move page down"
					>
						<ArrowDown className="h-3 w-3" />
					</button>
				</div>
			)}
			{!page.uploading && (
				<button
					type="button"
					onClick={() => onRemove(page.order)}
					className="shrink-0 p-1 rounded text-muted-foreground hover:text-destructive transition-colors"
					aria-label="Remove page"
				>
					<Trash2 className="h-3.5 w-3.5" />
				</button>
			)}
		</div>
	)
}
