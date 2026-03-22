"use client"

import { BoundingBoxViewer } from "@/components/BoundingBoxViewer"
import type { ScanPageUrl } from "@/lib/mark-actions"
import { ChevronLeft, ChevronRight, FileText } from "lucide-react"
import { useState } from "react"

export function ScanPageViewer({
	pages,
	className,
}: {
	pages: ScanPageUrl[]
	className?: string
}) {
	const [current, setCurrent] = useState(0)

	if (pages.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center gap-2 rounded-xl border bg-muted/30 py-12 text-sm text-muted-foreground">
				<FileText className="h-6 w-6 opacity-40" />
				<span>No scan pages available</span>
			</div>
		)
	}

	const page = pages[current]
	if (!page) return null

	const isPdf = page.mimeType === "application/pdf"
	const total = pages.length

	return (
		<div className={className}>
			{/* Page switcher */}
			{total > 1 && (
				<div className="mb-2 flex items-center justify-between">
					<button
						type="button"
						disabled={current === 0}
						onClick={() => setCurrent((c) => c - 1)}
						className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
						aria-label="Previous page"
					>
						<ChevronLeft className="h-4 w-4" />
					</button>
					<span className="text-xs text-muted-foreground tabular-nums">
						Page {current + 1} of {total}
					</span>
					<button
						type="button"
						disabled={current === total - 1}
						onClick={() => setCurrent((c) => c + 1)}
						className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
						aria-label="Next page"
					>
						<ChevronRight className="h-4 w-4" />
					</button>
				</div>
			)}

			{/* Page content:
			    - PDF: always <iframe>
			    - Image with OCR analysis (new jobs): BoundingBoxViewer with highlights + transcript
			    - Image without analysis (jobs processed before overlay was added): plain <img> */}
			{isPdf ? (
				<div className="relative overflow-hidden rounded-xl border bg-muted/20">
					<iframe
						src={page.url}
						title={`Page ${current + 1}`}
						className="h-150 w-full border-0"
					/>
				</div>
			) : page.analysis ? (
				<BoundingBoxViewer imageUrl={page.url} analysis={page.analysis} />
			) : (
				<div className="relative overflow-hidden rounded-xl border bg-muted/20">
					{/* eslint-disable-next-line @next/next/no-img-element -- presigned S3 URL; next/image requires known dimensions */}
					<img
						src={page.url}
						alt={`Scan page ${current + 1}`}
						className="block w-full rounded-xl"
					/>
				</div>
			)}

			{/* Thumbnail strip for multi-page */}
			{total > 1 && (
				<div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
					{pages.map((p, i) => (
						<button
							key={p.order}
							type="button"
							onClick={() => setCurrent(i)}
							className={`shrink-0 rounded border overflow-hidden transition-all ${
								i === current
									? "ring-2 ring-primary border-primary"
									: "border-border opacity-60 hover:opacity-100"
							}`}
							aria-label={`Go to page ${i + 1}`}
						>
							{p.mimeType === "application/pdf" ? (
								<div className="flex h-14 w-10 items-center justify-center bg-muted text-xs text-muted-foreground">
									<FileText className="h-4 w-4" />
								</div>
							) : (
								// eslint-disable-next-line @next/next/no-img-element
								<img
									src={p.url}
									alt={`Page ${i + 1}`}
									className="h-14 w-10 object-cover"
								/>
							)}
						</button>
					))}
				</div>
			)}
		</div>
	)
}
