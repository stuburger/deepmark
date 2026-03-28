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
import type { HandwritingAnalysis, PageToken } from "@/lib/handwriting-types"
import { cn } from "@/lib/utils"
import { Minus, Plus, RotateCcw } from "lucide-react"
import { useState } from "react"
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch"

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
	/** null = Vision hull, "gemini_fallback" = fallback-estimated region */
	source?: string | null
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
	onAnnotationClick,
}: {
	annotation: GradingAnnotation
	onAnnotationClick?: (questionNumber: string) => void
}) {
	const [yMin, xMin, yMax, xMax] = annotation.box
	if (yMax === 0 && xMax === 0) return null

	const color = annotationColor(annotation.awardedScore, annotation.maxScore)

	return (
		<button
			type="button"
			aria-label={`Q${annotation.questionNumber}: jump to answer`}
			onClick={() => onAnnotationClick?.(annotation.questionNumber)}
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

// ─── Per-token popover ────────────────────────────────────────────────────────

const TOKEN_COLOR = "rgb(59 130 246)" // blue-500

function TokenOverlay({ token, index }: { token: PageToken; index: number }) {
	const [yMin, xMin, yMax, xMax] = token.bbox
	const displayText = token.text_corrected ?? token.text_raw

	return (
		<Popover key={index}>
			<PopoverTrigger
				aria-label={`Word: ${displayText}`}
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

			<PopoverContent side="right" sideOffset={8} className="w-72">
				<PopoverHeader>
					<span
						className="inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-semibold text-white"
						style={{ backgroundColor: TOKEN_COLOR }}
					>
						Word
					</span>
					<PopoverTitle className="mt-2 font-mono text-sm leading-snug wrap-break-word">
						&ldquo;{displayText}&rdquo;
					</PopoverTitle>
				</PopoverHeader>

				{token.text_corrected && token.text_corrected !== token.text_raw && (
					<PopoverDescription className="rounded-md bg-blue-50 px-2.5 py-2 text-xs text-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
						OCR read: &ldquo;{token.text_raw}&rdquo;
					</PopoverDescription>
				)}

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
					{token.confidence !== null && (
						<div className="flex items-center justify-between">
							<span>Confidence</span>
							<span className="font-mono tabular-nums">
								{Math.round((token.confidence ?? 0) * 100)}%
							</span>
						</div>
					)}
				</div>
			</PopoverContent>
		</Popover>
	)
}

// ─── Main viewer ──────────────────────────────────────────────────────────────

type Props = {
	imageUrl: string
	analysis: HandwritingAnalysis
	/** Word-level tokens from Cloud Vision — rendered as interactive overlays. */
	tokens?: PageToken[]
	className?: string
	/** When false, transcript and observations are omitted (shown elsewhere). */
	showAnalysisText?: boolean
	/** Controls word-token highlight visibility. Defaults to false. */
	showHighlights?: boolean
	/** Grading annotations to overlay on the image — one per question answer region. */
	gradingAnnotations?: GradingAnnotation[]
	/** Called when a grading annotation region is clicked, with the question number. */
	onAnnotationClick?: (questionNumber: string) => void
	/** When true, shows debug labels on fallback-sourced regions. */
	debugMode?: boolean
}

export function BoundingBoxViewer({
	imageUrl,
	analysis,
	tokens = [],
	className,
	showAnalysisText = true,
	showHighlights = false,
	gradingAnnotations,
	onAnnotationClick,
	debugMode = false,
}: Props) {
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
		<div className={cn("space-y-2", className)}>
			<TransformWrapper
				minScale={0.3}
				maxScale={8}
				wheel={{ step: 0.08, activationKeys: ["Control", "Meta"] }}
				pinch={{ step: 5 }}
				doubleClick={{ mode: "reset" }}
				limitToBounds={false}
			>
				{({ zoomIn, zoomOut, resetTransform }) => (
					<>
						{/* Zoom controls */}
						<div className="flex items-center justify-end gap-1 pb-1">
							<button
								type="button"
								onClick={() => zoomOut(0.5)}
								className="flex h-7 w-7 items-center justify-center rounded border bg-background text-muted-foreground transition-colors hover:bg-muted"
								aria-label="Zoom out"
							>
								<Minus className="h-3.5 w-3.5" />
							</button>
							<button
								type="button"
								onClick={() => resetTransform()}
								className="flex h-7 w-7 items-center justify-center rounded border bg-background text-muted-foreground transition-colors hover:bg-muted"
								aria-label="Reset zoom"
								title="Reset zoom (or double-click the image)"
							>
								<RotateCcw className="h-3.5 w-3.5" />
							</button>
							<button
								type="button"
								onClick={() => zoomIn(0.5)}
								className="flex h-7 w-7 items-center justify-center rounded border bg-background text-muted-foreground transition-colors hover:bg-muted"
								aria-label="Zoom in"
							>
								<Plus className="h-3.5 w-3.5" />
							</button>
						</div>

						{/*
						 * TransformComponent: the image + all overlays live here.
						 * react-zoom-pan-pinch applies a single CSS matrix() transform
						 * to the content div, so image, SVG geometry, and click targets
						 * all scale and pan together — no coordinate maths needed.
						 *
						 * Drag to pan · Scroll to zoom · Double-click to reset
						 */}
						<TransformComponent
							wrapperStyle={{
								width: "100%",
								overflow: "hidden",
								borderRadius: "0.5rem",
							}}
							contentStyle={{ width: "100%" }}
						>
							<div className="relative w-full overflow-visible rounded-lg border bg-muted cursor-grab active:cursor-grabbing">
								{/* eslint-disable-next-line @next/next/no-img-element -- presigned S3 URL */}
								<img
									src={imageUrl}
									alt="Uploaded handwritten page"
									className="block w-full rounded-lg"
									onLoad={handleImageLoad}
									draggable={false}
								/>

								{imageDims && (
									<>
										{/* Grading annotation bands */}
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
													const color = annotationColor(
														ann.awardedScore,
														ann.maxScore,
													)
													return (
														<g key={i}>
															<rect
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
															{debugMode &&
																ann.source === "gemini_fallback" && (
																	<>
																		<rect
																			x={xMin * scaleX}
																			y={yMin * scaleY}
																			width={120}
																			height={18}
																			fill="rgb(31 41 55)"
																			fillOpacity={0.85}
																		/>
																		<text
																			x={xMin * scaleX + 6}
																			y={yMin * scaleY + 12}
																			fill="white"
																			fontSize="10"
																			fontWeight="600"
																		>
																			gemini_fallback
																		</text>
																	</>
																)}
														</g>
													)
												})}
											</svg>
										)}

										{/* Word-level highlight layer */}
										{showHighlights && tokens.length > 0 && (
											<svg
												viewBox={viewBox}
												preserveAspectRatio="none"
												className="absolute inset-0 h-full w-full"
												style={{
													pointerEvents: "none",
													mixBlendMode: "multiply",
												}}
											>
												{tokens.map((t, i) => {
													const [yMin, xMin, yMax, xMax] = t.bbox
													return (
														<rect
															key={i}
															x={xMin * scaleX}
															y={yMin * scaleY}
															width={(xMax - xMin) * scaleX}
															height={(yMax - yMin) * scaleY}
															fill={TOKEN_COLOR}
															fillOpacity={0.25}
															stroke="none"
														/>
													)
												})}
											</svg>
										)}

										{/* Grading annotation click targets */}
										{hasAnnotations &&
											gradingAnnotations.map((ann, i) => (
												<GradingAnnotationOverlay
													key={i}
													annotation={ann}
													onAnnotationClick={onAnnotationClick}
												/>
											))}

										{/* Word-level token popovers */}
										{showHighlights &&
											tokens.map((t, i) => (
												<TokenOverlay key={t.id} token={t} index={i} />
											))}
									</>
								)}
							</div>
						</TransformComponent>
					</>
				)}
			</TransformWrapper>

			{showAnalysisText ? (
				<HandwritingAnalysisPanel analysis={analysis} />
			) : null}
		</div>
	)
}
