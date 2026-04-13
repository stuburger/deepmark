"use client"

import { ScrollArea } from "@/components/ui/scroll-area"
import type {
	PageToken,
	ScanPageUrl,
	StudentPaperAnnotation,
	StudentPaperJobPayload,
} from "@/lib/marking/types"
import { AnnotatedScanColumn } from "./results/annotated-scan-column"

export function ScanPanel({
	scanPages,
	pageTokens,
	gradingResults,
	showOcr,
	showRegions,
	onAnnotationClick,
	debugMode,
	annotations = [],
	showMarks = false,
	showChains = false,
	highlightedTokenIds,
}: {
	scanPages: ScanPageUrl[]
	pageTokens: PageToken[]
	gradingResults: StudentPaperJobPayload["grading_results"]
	showOcr: boolean
	showRegions: boolean
	onAnnotationClick?: (questionNumber: string) => void
	debugMode?: boolean
	annotations?: StudentPaperAnnotation[]
	showMarks?: boolean
	showChains?: boolean
	highlightedTokenIds?: Set<string> | null
}) {
	return (
		<ScrollArea className="h-full w-full bg-muted/20">
			<AnnotatedScanColumn
				pages={scanPages}
				pageTokens={pageTokens}
				showHighlights={showOcr}
				showRegions={showRegions}
				gradingResults={gradingResults}
				onAnnotationClick={onAnnotationClick}
				debugMode={debugMode}
				annotations={annotations}
				showMarks={showMarks}
				showChains={showChains}
				highlightedTokenIds={highlightedTokenIds}
			/>
		</ScrollArea>
	)
}
