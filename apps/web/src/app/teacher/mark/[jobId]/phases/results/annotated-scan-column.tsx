"use client"

import {
	BoundingBoxViewer,
	type GradingAnnotation,
} from "@/components/BoundingBoxViewer"
import { HandwritingAnalysisPanel } from "@/components/HandwritingAnalysisPanel"
import type { GradingResult, ScanPageUrl } from "@/lib/mark-actions"

function annotationsForPage(
	gradingResults: GradingResult[],
	pageOrder: number,
): GradingAnnotation[] {
	return gradingResults.flatMap((r) => {
		const region = r.answer_regions?.find((ar) => ar.page === pageOrder)
		if (!region) return []
		return [
			{
				questionNumber: r.question_number,
				questionText: r.question_text,
				feedbackSummary: r.feedback_summary,
				awardedScore: r.awarded_score,
				maxScore: r.max_score,
				box: region.box,
			},
		]
	})
}

/**
 * Renders all scan pages vertically with optional grading bounding-box overlays.
 * Used in the left column of the completed results view.
 */
export function AnnotatedScanColumn({
	pages,
	showHighlights,
	gradingResults,
}: {
	pages: ScanPageUrl[]
	showHighlights: boolean
	gradingResults: GradingResult[]
}) {
	if (pages.length === 0) return null

	return (
		<div className="flex flex-col gap-8 px-6 py-6">
			{pages.map((page, i) => {
				const isPdf = page.mimeType === "application/pdf"
				const label =
					pages.length > 1 ? `Page ${i + 1} of ${pages.length}` : null
				const annotations = annotationsForPage(gradingResults, page.order)

				return (
					<div key={page.order} className="flex flex-col gap-2">
						{label && (
							<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
								{label}
							</p>
						)}

						{isPdf ? (
							<div className="relative overflow-hidden rounded-xl border bg-muted/20">
								<iframe
									src={page.url}
									title={`Page ${i + 1}`}
									className="h-[80vh] w-full border-0"
								/>
							</div>
						) : page.analysis ? (
							<div className="space-y-2">
								<div className="flex items-center gap-2">
									<span className="text-xs text-muted-foreground">OCR</span>
									<HandwritingAnalysisPanel analysis={page.analysis} />
								</div>
								<BoundingBoxViewer
									imageUrl={page.url}
									analysis={page.analysis}
									showAnalysisText={false}
									showHighlights={showHighlights}
									gradingAnnotations={
										annotations.length > 0 ? annotations : undefined
									}
								/>
							</div>
						) : (
							<div className="relative overflow-hidden rounded-xl border bg-muted/20">
								{/* eslint-disable-next-line @next/next/no-img-element -- presigned S3 URL */}
								<img
									src={page.url}
									alt={`Scan page ${i + 1}`}
									className="block w-full rounded-xl"
								/>
							</div>
						)}
					</div>
				)
			})}
		</div>
	)
}
