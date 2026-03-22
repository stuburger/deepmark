"use client"

import { HandwritingAnalysisPanel } from "@/components/HandwritingAnalysisPanel"
import type { ScanPageUrl } from "@/lib/mark-actions"
import { type ReactNode, useState } from "react"
import { ScanPageViewer } from "./scan-viewer"

type Props = {
	scanPages: ScanPageUrl[]
	children: ReactNode
	/** Wrapper when there are no scan pages (matches previous TwoColumnLayout / results behaviour). */
	whenNoScanClassName?: string
}

export function MarkScanTwoColumn({
	scanPages,
	children,
	whenNoScanClassName = "max-w-2xl space-y-6",
}: Props) {
	const [pageIndex, setPageIndex] = useState(0)
	const page = scanPages[pageIndex]
	const analysis =
		page && page.mimeType !== "application/pdf" ? page.analysis : undefined

	if (scanPages.length === 0) {
		return <div className={whenNoScanClassName}>{children}</div>
	}

	return (
		<div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
			<div className="lg:sticky lg:top-6 lg:w-80 xl:w-96 shrink-0">
				<p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
					Student scan
				</p>
				<ScanPageViewer
					pages={scanPages}
					pageIndex={pageIndex}
					onPageIndexChange={setPageIndex}
					analysisTextPlacement="external"
				/>
			</div>

			<div className="flex-1 min-w-0 space-y-6">
				{analysis ? <HandwritingAnalysisPanel analysis={analysis} /> : null}
				{children}
			</div>
		</div>
	)
}
