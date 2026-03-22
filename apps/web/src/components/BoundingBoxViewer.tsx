"use client"

import { HandwritingAnalysisPanel } from "@/components/HandwritingAnalysisPanel"
import {
	Popover,
	PopoverContent,
	PopoverDescription,
	PopoverHeader,
	PopoverTitle,
	PopoverTrigger,
} from "@/components/ui/popover"
import type {
	HandwritingAnalysis,
	HandwritingFeature,
} from "@/lib/scan-actions"
import { cn } from "@/lib/utils"
import { useState } from "react"

// ─── Colour map ───────────────────────────────────────────────────────────────

const FEATURE_META: Record<
	string,
	{ color: string; label: string; note?: string }
> = {
	word: { color: "rgb(59 130 246)", label: "Word" },
	line: { color: "rgb(34 197 94)", label: "Line" },
	paragraph: { color: "rgb(168 85 247)", label: "Paragraph" },
	correction: {
		color: "rgb(239 68 68)",
		label: "Correction",
		note: "Student has amended this text — consider both versions when awarding marks.",
	},
	"crossing-out": {
		color: "rgb(249 115 22)",
		label: "Crossed out",
		note: "Student has rejected this text — do not credit crossed-out work.",
	},
	diagram: {
		color: "rgb(20 184 166)",
		label: "Diagram",
		note: "Diagram detected — check labelling, scale, and accuracy against the mark scheme.",
	},
	punctuation: {
		color: "rgb(234 179 8)",
		label: "Punctuation",
		note: "Punctuation mark — review in context of the surrounding text.",
	},
}

const FALLBACK_META = {
	color: "rgb(156 163 175)",
	label: "Feature",
	note: undefined,
}

function getMeta(featureType: string) {
	return FEATURE_META[featureType] ?? FALLBACK_META
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rowLabel(y: number) {
	if (y < 333) return "top"
	if (y < 667) return "middle"
	return "bottom"
}

function colLabel(x: number) {
	if (x < 333) return "left"
	if (x < 667) return "centre"
	return "right"
}

// ─── Grading annotation types ─────────────────────────────────────────────────

export type GradingAnnotation = {
	questionNumber: string
	questionText: string
	feedbackSummary: string
	awardedScore: number
	maxScore: number
	/** [yMin, xMin, yMax, xMax] normalised 0–1000 */
	box: [number, number, number, number]
}

function annotationColor(awarded: number, max: number): string {
	if (max === 0) return "rgb(156 163 175)"
	const pct = awarded / max
	if (pct >= 0.7) return "rgb(34 197 94)"
	if (pct >= 0.4) return "rgb(234 179 8)"
	return "rgb(239 68 68)"
}

// ─── Per-grading-annotation overlay ──────────────────────────────────────────

function GradingAnnotationOverlay({
	annotation,
}: {
	annotation: GradingAnnotation
}) {
	const [yMin, xMin, yMax, xMax] = annotation.box
	if (yMax === 0 && xMax === 0) return null

	const color = annotationColor(annotation.awardedScore, annotation.maxScore)
	const pct =
		annotation.maxScore > 0
			? annotation.awardedScore / annotation.maxScore
			: null
	const scoreLabel = `${annotation.awardedScore}/${annotation.maxScore}`

	return (
		<Popover>
			<PopoverTrigger
				aria-label={`Q${annotation.questionNumber} answer region`}
				style={{
					position: "absolute",
					left: `${xMin / 10}%`,
					top: `${yMin / 10}%`,
					width: `${(xMax - xMin) / 10}%`,
					height: `${(yMax - yMin) / 10}%`,
					background: "transparent",
					border: "none",
					padding: 0,
					cursor: "pointer",
				}}
			/>
			<PopoverContent side="right" sideOffset={8} className="w-80">
				<PopoverHeader>
					<div className="flex items-center justify-between gap-2">
						<span className="text-xs font-mono text-muted-foreground">
							Q{annotation.questionNumber}
						</span>
						<span
							className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold text-white"
							style={{ backgroundColor: color }}
						>
							{scoreLabel}
							{pct !== null ? ` · ${Math.round(pct * 100)}%` : ""}
						</span>
					</div>
					<PopoverTitle className="mt-1.5 text-sm line-clamp-2 font-normal text-foreground">
						{annotation.questionText}
					</PopoverTitle>
				</PopoverHeader>
				<PopoverDescription className="text-sm leading-relaxed">
					{annotation.feedbackSummary}
				</PopoverDescription>
			</PopoverContent>
		</Popover>
	)
}

// ─── Per-feature popover ──────────────────────────────────────────────────────

type FeatureProps = {
	feature: HandwritingFeature
	index: number
}

function FeatureOverlay({ feature, index }: FeatureProps) {
	const [yMin, xMin, yMax, xMax] = feature.box_2d
	const meta = getMeta(feature.feature_type)

	// Convert 0–1000 Gemini coordinates to CSS percentages.
	// The parent container is `position: relative` and sized to the displayed
	// image, so percentage values map exactly onto the image.
	const left = `${xMin / 10}%`
	const top = `${yMin / 10}%`
	const width = `${(xMax - xMin) / 10}%`
	const height = `${(yMax - yMin) / 10}%`

	return (
		<Popover key={index}>
			<PopoverTrigger
				aria-label={`${meta.label}: ${feature.label}`}
				style={{
					position: "absolute",
					left,
					top,
					width,
					height,
					background: "transparent",
					border: "none",
					padding: 0,
					cursor: "pointer",
				}}
			/>

			<PopoverContent side="right" sideOffset={8} className="w-80">
				<PopoverHeader>
					{/* Feature type badge */}
					<span
						className="inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-semibold text-white"
						style={{ backgroundColor: meta.color }}
					>
						{meta.label}
					</span>

					{/* Transcribed text */}
					<PopoverTitle className="mt-2 font-mono text-sm leading-snug wrap-break-word">
						&ldquo;{feature.label}&rdquo;
					</PopoverTitle>
				</PopoverHeader>

				{/* Marking note (only for relevant feature types) */}
				{meta.note && (
					<PopoverDescription className="flex items-start gap-1.5 rounded-md bg-amber-50 px-2.5 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
						<span className="mt-px shrink-0">⚑</span>
						<span>{meta.note}</span>
					</PopoverDescription>
				)}

				{/* Position + coordinates */}
				<div className="space-y-1 border-t pt-2 text-xs text-muted-foreground">
					<div className="flex items-center justify-between">
						<span>Location</span>
						<span className="font-medium capitalize">
							{rowLabel(yMin)} {colLabel(xMin)}
						</span>
					</div>
					<div className="flex items-center justify-between">
						<span>Coordinates</span>
						<span className="font-mono tabular-nums">
							y {yMin}–{yMax} · x {xMin}–{xMax}
						</span>
					</div>
				</div>
			</PopoverContent>
		</Popover>
	)
}

// ─── Main viewer ──────────────────────────────────────────────────────────────

type Props = {
	imageUrl: string
	analysis: HandwritingAnalysis
	className?: string
	/** When false, transcript and observations are omitted (shown elsewhere, e.g. mark flow RHS). */
	showAnalysisText?: boolean
	/** Controls highlight visibility. Defaults to false when omitted. */
	showHighlights?: boolean
	/**
	 * Grading annotations to overlay on the image — one per question answer region.
	 * Each annotation draws a coloured band and a click-to-expand feedback popover.
	 */
	gradingAnnotations?: GradingAnnotation[]
}

export function BoundingBoxViewer({
	imageUrl,
	analysis,
	className,
	showAnalysisText = true,
	showHighlights = false,
	gradingAnnotations,
}: Props) {
	const features = analysis.features ?? []
	const [imageDims, setImageDims] = useState<{ w: number; h: number } | null>(
		null,
	)

	const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
		setImageDims({
			w: e.currentTarget.naturalWidth,
			h: e.currentTarget.naturalHeight,
		})
	}

	const viewBox = imageDims
		? `0 0 ${imageDims.w} ${imageDims.h}`
		: "0 0 1000 1000"
	const scaleX = (imageDims?.w ?? 1000) / 1000
	const scaleY = (imageDims?.h ?? 1000) / 1000

	const hasAnnotations =
		gradingAnnotations !== undefined && gradingAnnotations.length > 0

	return (
		<div className={cn("space-y-4", className)}>
			{/* Image + overlay container */}
			<div className="relative w-full overflow-visible rounded-lg border bg-muted">
				{/* eslint-disable-next-line @next/next/no-img-element -- presigned S3 URL; next/image cannot optimize it and requires known dimensions */}
				<img
					src={imageUrl}
					alt="Uploaded handwritten page"
					className="block w-full rounded-lg"
					onLoad={handleImageLoad}
				/>

				{imageDims && (
					<>
						{/* Grading annotation bands — always shown when present.
						    Rendered below the word-level highlights so they form a
						    background wash rather than obscuring fine detail. */}
						{hasAnnotations && (
							<svg
								viewBox={viewBox}
								preserveAspectRatio="none"
								className="absolute inset-0 h-full w-full"
								style={{ pointerEvents: "none" }}
							>
								{gradingAnnotations.map((ann, i) => {
									const [yMin, xMin, yMax, xMax] = ann.box
									if (yMax === 0 && xMax === 0) return null
									const color = annotationColor(ann.awardedScore, ann.maxScore)
									return (
										<rect
											key={i}
											x={xMin * scaleX}
											y={yMin * scaleY}
											width={(xMax - xMin) * scaleX}
											height={(yMax - yMin) * scaleY}
											fill={color}
											fillOpacity={0.1}
											stroke={color}
											strokeWidth={2}
											strokeOpacity={0.5}
										/>
									)
								})}
							</svg>
						)}

						{/* Word-level highlight layer */}
						{showHighlights && (
							<svg
								viewBox={viewBox}
								preserveAspectRatio="none"
								className="absolute inset-0 h-full w-full"
								style={{ pointerEvents: "none", mixBlendMode: "multiply" }}
							>
								{features.map((f: HandwritingFeature, i: number) => {
									const [yMin, xMin, yMax, xMax] = f.box_2d
									const { color } = getMeta(f.feature_type)
									return (
										<rect
											key={i}
											x={xMin * scaleX}
											y={yMin * scaleY}
											width={(xMax - xMin) * scaleX}
											height={(yMax - yMin) * scaleY}
											fill={color}
											fillOpacity={0.35}
											stroke="none"
										/>
									)
								})}
							</svg>
						)}

						{/* Grading annotation click targets (above SVG layers) */}
						{hasAnnotations &&
							gradingAnnotations.map((ann, i) => (
								<GradingAnnotationOverlay key={i} annotation={ann} />
							))}

						{/* Word-level feature popovers — only interactive when overlay is on */}
						{showHighlights &&
							features.map((f: HandwritingFeature, i: number) => (
								<FeatureOverlay key={i} feature={f} index={i} />
							))}
					</>
				)}
			</div>

			{showAnalysisText ? (
				<HandwritingAnalysisPanel analysis={analysis} />
			) : null}

			{/* Legend — only shown when OCR overlay is active */}
			{showHighlights && (
				<div className="rounded-lg border bg-card p-4">
					<h3 className="mb-2 font-medium">OCR feature legend</h3>
					<div className="flex flex-wrap gap-3 text-xs">
						{Object.entries(FEATURE_META).map(([type, { color, label }]) => (
							<span key={type} className="flex items-center gap-1.5">
								<span
									className="inline-block size-3 rounded-sm"
									style={{ backgroundColor: color }}
								/>
								{label}
							</span>
						))}
					</div>
				</div>
			)}
		</div>
	)
}
