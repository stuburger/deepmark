"use client"

import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"

export function DocumentPdfPreviewDialog({
	open,
	onOpenChange,
	title,
	pdfUrl,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	title: string
	pdfUrl: string
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="inset-4! flex w-auto! max-w-none! translate-x-0! translate-y-0! flex-col gap-0 overflow-hidden rounded-2xl p-0 ring-0 shadow-2xl">
				<DialogHeader className="shrink-0 border-b px-4 py-3">
					<DialogTitle className="text-base">{title}</DialogTitle>
				</DialogHeader>
				<div className="flex min-h-0 flex-1 flex-col">
					<iframe
						src={pdfUrl}
						className="h-full min-h-0 w-full flex-1 border-0"
						title={title}
					/>
				</div>
			</DialogContent>
		</Dialog>
	)
}
