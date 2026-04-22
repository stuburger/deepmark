"use client"

import { Button } from "@/components/ui/button"
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover"
import { FileText, Plus, Trash2 } from "lucide-react"
import type { DeletedPage } from "./staged-script-review-list"

type StagingReviewToolbarProps = {
	deletedPages: DeletedPage[]
	onRestore: (pageKey: string) => void
	onAddScript?: () => Promise<void>
	addingScript: boolean
}

export function StagingReviewToolbar({
	deletedPages,
	onRestore,
	onAddScript,
	addingScript,
}: StagingReviewToolbarProps) {
	const count = deletedPages.length

	return (
		<div className="shrink-0 flex items-center gap-2 border-b bg-muted/40 px-4 h-11">
			{/* Add script — left anchor */}
			{onAddScript && (
				<Button
					variant="ghost"
					size="sm"
					className="gap-1.5 h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground border border-dashed"
					onClick={onAddScript}
					disabled={addingScript}
				>
					<Plus className="h-3.5 w-3.5" />
					Add script
				</Button>
			)}

			<div className="flex-1" />

			{/* Deleted-pages trash — right anchor */}
			<Popover>
				<PopoverTrigger
					disabled={count === 0}
					title={
						count === 0
							? "No deleted pages"
							: `${count} deleted page${count === 1 ? "" : "s"} — click to restore`
					}
					className="relative inline-flex h-8 w-8 items-center justify-center rounded-md text-sm transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
				>
					<Trash2
						className={`h-4 w-4 ${count > 0 ? "text-destructive" : "text-muted-foreground"}`}
					/>
					{count > 0 && (
						<span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-semibold text-destructive-foreground tabular-nums leading-none">
							{count > 9 ? "9+" : count}
						</span>
					)}
				</PopoverTrigger>

				<PopoverContent align="end" className="w-80 p-0" sideOffset={6}>
					{/* Header */}
					<div className="px-4 py-3 border-b">
						<p className="text-sm font-semibold">Deleted pages</p>
						<p className="text-xs text-muted-foreground mt-0.5">
							Restore pages to add them back to their script
						</p>
					</div>

					{/* Page list */}
					<div className="max-h-72 overflow-y-auto divide-y">
						{deletedPages.map((page) => (
							<div
								key={page.pageKey}
								className="flex items-center gap-3 px-4 py-2.5"
							>
								{/* Thumbnail */}
								<div className="shrink-0 w-9 h-12.75 rounded overflow-hidden border bg-muted/40">
									{page.url ? (
										// eslint-disable-next-line @next/next/no-img-element
										<img
											src={page.url}
											alt=""
											draggable={false}
											className="w-full h-full object-cover"
										/>
									) : (
										<div className="w-full h-full flex items-center justify-center">
											<FileText className="h-3 w-3 text-muted-foreground/40" />
										</div>
									)}
								</div>

								{/* Script name + original page number */}
								<div className="flex-1 min-w-0">
									<p className="text-xs font-medium truncate leading-tight">
										{page.scriptName || "Unnamed script"}
									</p>
									<p className="text-[11px] text-muted-foreground mt-0.5">
										Page {page.originalOrder}
									</p>
								</div>

								<Button
									variant="outline"
									size="sm"
									className="h-7 px-2.5 text-xs shrink-0"
									onClick={() => onRestore(page.pageKey)}
								>
									Restore
								</Button>
							</div>
						))}
					</div>
				</PopoverContent>
			</Popover>
		</div>
	)
}
