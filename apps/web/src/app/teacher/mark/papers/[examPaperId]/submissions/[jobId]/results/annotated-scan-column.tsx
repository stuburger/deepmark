"use client"

import {
	BoundingBoxViewer,
	type GradingAnnotation,
} from "@/components/BoundingBoxViewer"
import type {
	GradingResult,
	PageToken,
	ScanPageUrl,
	StudentPaperAnnotation,
} from "@/lib/marking/types"
import { useEffect, useRef } from "react"

/**
 * Lightweight clickable region overlay for pages that have no OCR analysis.
 * Mirrors the coordinate system used by BoundingBoxViewer (0–1000 normalised).
 */
function SimpleRegionButton({
	annotation,
	onGradedRegionClick,
}: {
	annotation: GradingAnnotation
	onGradedRegionClick?: (questionNumber: string) => void
}) {
	const [yMin, xMin, yMax, xMax] = annotation.box
	if (yMax === 0 && xMax === 0) return null

	const pct =
		annotation.maxScore > 0
			? annotation.awardedScore / annotation.maxScore
			: null
	const color =
		pct === null
			? "rgb(156 163 175)"
			: pct >= 0.7
				? "rgb(34 197 94)"
				: pct >= 0.4
					? "rgb(234 179 8)"
					: "rgb(239 68 68)"

	return (
		<button
			type="button"
			aria-label={`Q${annotation.questionNumber}: jump to answer`}
			onClick={() => onGradedRegionClick?.(annotation.questionNumber)}
			className="rounded-sm transition-opacity hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
			style={{
				position: "absolute",
				left: `${xMin / 10}%`,
				top: `${yMin / 10}%`,
				width: `${(xMax - xMin) / 10}%`,
				height: `${(yMax - yMin) / 10}%`,
				background: "transparent",
				boxShadow: `inset 0 0 0 2px ${color}`,
				padding: 0,
				cursor: "pointer",
			}}
		/>
	)
}

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
				source: region.source,
			},
		]
	})
}

/**
 * Renders all scan pages vertically with optional overlays.
 * showHighlights: toggles Cloud Vision word-token overlays
 * showRegions: toggles grading answer-region overlays (score badges on scan)
 */
export function AnnotatedScanColumn({
	pages,
	pageTokens = [],
	showHighlights,
	showRegions = true,
	gradingResults,
	onGradedRegionClick,
	debugMode = false,
	annotations = [],
	showMarks = false,
	showChains = false,
	highlightedTokenIds,
}: {
	pages: ScanPageUrl[]
	/** Cloud Vision word-level tokens for all pages — filtered per page internally. */
	pageTokens?: PageToken[]
	showHighlights: boolean
	/** When false, grading annotation boxes are hidden even if data is present. */
	showRegions?: boolean
	gradingResults: GradingResult[]
	/** Called when a graded answer region is clicked, with the question number. */
	onGradedRegionClick?: (questionNumber: string) => void
	/** When true, shows debug labels on Gemini-fallback regions. */
	debugMode?: boolean
	/** Mark overlays — filtered per page internally. */
	annotations?: StudentPaperAnnotation[]
	/** Controls mark + tag overlay visibility. */
	showMarks?: boolean
	/** Controls chain indicator highlight visibility. */
	showChains?: boolean
	/** Token IDs to highlight (from PM hover). */
	highlightedTokenIds?: Set<string> | null
	/** Called when a token is hovered on the scan. */
}) {
	// Map question_id → question_number so a mark click can route to the
	// matching graded region's question navigation.
	const questionIdToNumber = new Map(
		gradingResults.map((r) => [r.question_id, r.question_number]),
	)
	const handleMarkClick = (questionId: string) => {
		const questionNumber = questionIdToNumber.get(questionId)
		if (questionNumber) onGradedRegionClick?.(questionNumber)
	}

	// Outer scroll: when a single token is highlighted, scroll the containing
	// ScrollArea to bring the right page into view before the viewer pans.
	const containerRef = useRef<HTMLDivElement>(null)
	useEffect(() => {
		if (
			!highlightedTokenIds ||
			highlightedTokenIds.size !== 1 ||
			!containerRef.current
		)
			return
		const [focusId] = highlightedTokenIds
		const token = pageTokens.find((t) => t.id === focusId)
		if (!token) return
		const pageEl = containerRef.current.querySelector<HTMLElement>(
			`[data-page-order="${token.page_order}"]`,
		)
		pageEl?.scrollIntoView({ behavior: "smooth", block: "nearest" })
	}, [highlightedTokenIds, pageTokens])

	if (pages.length === 0) return null

	return (
		<div ref={containerRef} className="flex flex-col gap-8 px-6 py-6">
			{pages.map((page, i) => {
				const isPdf = page.mimeType === "application/pdf"
				const label =
					pages.length > 1 ? `Page ${i + 1} of ${pages.length}` : null
				const gradingAnns = annotationsForPage(gradingResults, page.order)
				const tokensForPage = pageTokens.filter(
					(t) => t.page_order === page.order,
				)
				const pageAnnotations = annotations.filter(
					(a) => a.page_order === page.order,
				)

				return (
					<div
						key={page.order}
						data-page-order={page.order}
						className="flex flex-col gap-2"
					>
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
							<BoundingBoxViewer
								imageUrl={page.url}
								analysis={page.analysis}
								tokens={tokensForPage}
								showAnalysisText={false}
								showHighlights={showHighlights}
								gradingAnnotations={
									showRegions && gradingAnns.length > 0
										? gradingAnns
										: undefined
								}
								onGradedRegionClick={onGradedRegionClick}
								debugMode={debugMode}
								annotations={pageAnnotations}
								showMarks={showMarks}
								showChains={showChains}
								onMarkClick={handleMarkClick}
								highlightedTokenIds={highlightedTokenIds}
							/>
						) : (
							<div className="relative overflow-hidden rounded-xl border bg-muted/20">
								{/* eslint-disable-next-line @next/next/no-img-element -- presigned S3 URL */}
								<img
									src={page.url}
									alt={`Scan page ${i + 1}`}
									className="block w-full rounded-xl"
								/>
								{showRegions &&
									gradingAnns.map((ann, idx) => (
										// biome-ignore lint/suspicious/noArrayIndexKey: static annotation list
										<div key={idx}>
											<SimpleRegionButton
												annotation={ann}
												onGradedRegionClick={onGradedRegionClick}
											/>
											{debugMode && ann.source === "gemini_fallback" && (
												<span
													className="pointer-events-none absolute rounded bg-slate-800/90 px-1.5 py-0.5 text-[10px] font-semibold text-white"
													style={{
														left: `${ann.box[1] / 10}%`,
														top: `${ann.box[0] / 10}%`,
													}}
												>
													gemini_fallback
												</span>
											)}
										</div>
									))}
							</div>
						)}
					</div>
				)
			})}
		</div>
	)
}
