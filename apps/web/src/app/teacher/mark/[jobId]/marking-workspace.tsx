"use client"

import { HandwritingAnalysisPanel } from "@/components/HandwritingAnalysisPanel"
import type { ScanPageUrl } from "@/lib/marking/types"
import { type ReactNode, useState } from "react"
import { ScanDocumentViewer } from "./scan-document-viewer"

type ScanMode =
	/** Single-page paginated viewer — sticky sidebar, used during processing/setup/marking phases */
	| "compact"
	/** All pages scrollable vertically — used for the completed results view */
	| "full"

type Props = {
	scanPages: ScanPageUrl[]
	children: ReactNode
	scanMode?: ScanMode
	/** Slot rendered above each page in full mode (e.g. bounding box overlays).
	 *  In compact mode the scan is rendered by ScanDocumentViewer directly. */
	renderFullScanColumn?: ReactNode
	/** Fallback wrapper className when there are no scan pages. */
	whenNoScanClassName?: string
}

export function MarkingWorkspace({
	scanPages,
	children,
	scanMode = "compact",
	renderFullScanColumn,
	whenNoScanClassName = "max-w-2xl space-y-6",
}: Props) {
	const [pageIndex, setPageIndex] = useState(0)
	const page = scanPages[pageIndex]
	const analysis =
		page && page.mimeType !== "application/pdf" ? page.analysis : undefined

	if (scanPages.length === 0) {
		return <div className={whenNoScanClassName}>{children}</div>
	}

	if (scanMode === "full") {
		return (
			<div className="-m-6 flex flex-col overflow-hidden h-dvh">
				{/* Sticky toolbar slot */}
				{children}
			</div>
		)
	}

	// compact mode — sticky narrow scan column on the left
	return (
		<div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
			<div className="lg:sticky lg:top-6 lg:w-80 xl:w-96 shrink-0">
				<p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
					Student scan
				</p>
				<ScanDocumentViewer
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

/**
 * Two-panel body for the full (results) scan mode.
 * Renders the annotated scan column on the left and results sidebar on the right.
 * Must be placed inside a MarkingWorkspace with scanMode="full".
 */
export function FullScanLayout({
	scanColumn,
	children,
}: {
	scanColumn: ReactNode
	children: ReactNode
}) {
	return (
		<div className="flex flex-1 min-h-0">
			<div className="flex-1 overflow-y-auto bg-muted/20">{scanColumn}</div>
			<div className="w-96 shrink-0 border-l overflow-y-auto">
				<div className="p-4 space-y-5">{children}</div>
			</div>
		</div>
	)
}
