"use client"

import { useAnswerRegionLayout } from "@/hooks/use-answer-region-layout"
import type {
	GradedAnswerOnPage,
	GradedPage,
	HandwritingFeature,
} from "@/lib/handwriting-types"
import { cn } from "@/lib/utils"
import { useState } from "react"
import { MarkingFeedbackThread } from "./MarkingFeedbackThread"

// ─── Score colour ─────────────────────────────────────────────────────────────

function scoreColor(awarded: number, max: number): string {
	if (max === 0) return "rgb(156 163 175)" // gray-400
	const pct = awarded / max
	if (pct >= 0.7) return "rgb(34 197 94)" // green-500
	if (pct >= 0.4) return "rgb(234 179 8)" // yellow-500
	return "rgb(239 68 68)" // red-500
}

// ─── Region helpers ──────────────────────────────────────────────────────────

/**
 * Returns [yMin, xMin, yMax, xMax] (0–1000 Gemini space) for the answer region.
 * Uses the refined answerRegion if available, otherwise the union of bounding boxes.
 */
function resolveRegion(
	answer: GradedAnswerOnPage,
): [number, number, number, number] | null {
	if (answer.answerRegion) return answer.answerRegion

	const boxes = answer.boundingBoxes as HandwritingFeature[]
	if (boxes.length === 0) return null

	const yMins = boxes.map((b) => b.box_2d[0])
	const xMins = boxes.map((b) => b.box_2d[1])
	const yMaxs = boxes.map((b) => b.box_2d[2])
	const xMaxs = boxes.map((b) => b.box_2d[3])

	return [
		Math.min(...yMins),
		Math.min(...xMins),
		Math.max(...yMaxs),
		Math.max(...xMaxs),
	]
}

/** Convert Gemini coords to CSS percentage strings for absolute positioning. */
function regionToCssStyle(region: [number, number, number, number]) {
	const [yMin, xMin, yMax, xMax] = region
	return {
		top: `${yMin / 10}%`,
		left: `${xMin / 10}%`,
		width: `${(xMax - xMin) / 10}%`,
		height: `${(yMax - yMin) / 10}%`,
	}
}

// ─── SVG highlight rect per answer ──────────────────────────────────────────

function AnswerHighlight({
	answer,
	scaleX,
	scaleY,
	isActive,
}: {
	answer: GradedAnswerOnPage
	scaleX: number
	scaleY: number
	isActive: boolean
}) {
	const region = resolveRegion(answer)
	if (!region) return null

	const [yMin, xMin, yMax, xMax] = region
	const color = scoreColor(answer.awardedScore, answer.maxScore)
	const isPending = !answer.answerRegion

	return (
		<rect
			x={xMin * scaleX}
			y={yMin * scaleY}
			width={(xMax - xMin) * scaleX}
			height={(yMax - yMin) * scaleY}
			fill={color}
			fillOpacity={isActive ? 0.45 : answer.isContinuation ? 0.2 : 0.3}
			stroke={isActive ? color : "none"}
			strokeWidth={isActive ? 2 : 0}
			className={isPending ? "animate-pulse" : undefined}
		/>
	)
}

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
	page: GradedPage
	activeQuestionId: string | null
	activeQuestionPartId?: string | null
	onQuestionActivate: (id: string | null, partId?: string | null) => void
	className?: string
}

// ─── Main component ──────────────────────────────────────────────────────────

export function GradedScanViewer({
	page,
	activeQuestionId,
	activeQuestionPartId = null,
	onQuestionActivate,
	className,
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

	const layout = useAnswerRegionLayout({
		answers: page.gradedAnswers,
		imageRenderedHeight: imageDims?.h ?? null,
		activeQuestionId,
		activeQuestionPartId,
	})

	// Primary answers only (no continuations) for the feedback panels
	const primaryAnswers = page.gradedAnswers.filter((a) => !a.isContinuation)

	return (
		<div className={cn("space-y-4", className)}>
			<div className="relative lg:pr-[34%]">
				{/* ── Image + overlay ─────────────────────────────────────────── */}
				<div className="relative w-full overflow-visible rounded-lg border bg-muted">
					{/* eslint-disable-next-line @next/next/no-img-element -- presigned S3 URL */}
					<img
						src={page.imageUrl}
						alt={`Scan page ${page.pageNumber}`}
						className="block w-full rounded-lg"
						onLoad={handleImageLoad}
					/>

					{imageDims && (
						<>
							{/* SVG highlight layer — mix-blend-multiply for highlighter effect */}
							<svg
								viewBox={viewBox}
								preserveAspectRatio="none"
								className="absolute inset-0 h-full w-full"
								style={{ pointerEvents: "none", mixBlendMode: "multiply" }}
							>
								{page.gradedAnswers.map((answer) => (
									<AnswerHighlight
										key={`${answer.questionId}-${answer.questionPartId ?? ""}`}
										answer={answer}
										scaleX={scaleX}
										scaleY={scaleY}
										isActive={
											answer.questionId === activeQuestionId &&
											(answer.questionPartId ?? null) ===
												(activeQuestionPartId ?? null)
										}
									/>
								))}
							</svg>

							{/* Transparent clickable trigger layer per answer region */}
							{page.gradedAnswers.map((answer) => {
								const region = resolveRegion(answer)
								if (!region) return null
								const style = regionToCssStyle(region)
								const isActive =
									answer.questionId === activeQuestionId &&
									(answer.questionPartId ?? null) ===
										(activeQuestionPartId ?? null)
								return (
									<button
										key={`trigger-${answer.questionId}-${answer.questionPartId ?? ""}`}
										type="button"
										aria-label={`Q${answer.questionNumber}: ${answer.questionText}`}
										style={{
											position: "absolute",
											...style,
											background: "transparent",
											border: "none",
											padding: 0,
											cursor: "pointer",
											outline: isActive ? "2px solid currentColor" : "none",
											outlineOffset: "2px",
										}}
										onClick={() =>
											isActive
												? onQuestionActivate(null, null)
												: onQuestionActivate(
														answer.questionId,
														answer.questionPartId,
													)
										}
									/>
								)
							})}
						</>
					)}
				</div>

				{/* ── Desktop floating aside ──────────────────────────────────── */}
				<aside
					className={cn(
						"pointer-events-none absolute top-0 right-0 hidden w-[32%] lg:block",
					)}
					aria-label="Answer feedback"
				>
					<div className="relative" style={{ minHeight: imageDims?.h ?? 600 }}>
						{layout.map(({ questionId, questionPartId, top }) => {
							const answer = page.gradedAnswers.find(
								(a) =>
									a.questionId === questionId &&
									(a.questionPartId ?? null) === (questionPartId ?? null),
							)
							if (!answer) return null
							const isActive =
								questionId === activeQuestionId &&
								(questionPartId ?? null) === (activeQuestionPartId ?? null)

							return (
								<div
									key={`card-${questionId}-${questionPartId ?? ""}`}
									className={cn(
										"pointer-events-auto absolute right-0 left-0 transition-[top] duration-300 ease-out",
										isActive ? "z-30" : "z-10",
									)}
									style={{ top }}
								>
									<MarkingFeedbackThread
										questionId={answer.questionId}
										questionPartId={answer.questionPartId}
										questionText={answer.questionText}
										questionNumber={answer.questionNumber}
										awardedScore={answer.awardedScore}
										maxScore={answer.maxScore}
										feedbackSummary={answer.feedbackSummary}
										llmReasoning={answer.llmReasoning}
										levelAwarded={answer.levelAwarded}
										markPointResults={answer.markPointResults}
										isContinuation={answer.isContinuation}
										expanded={isActive}
										isActive={isActive}
										onExpand={() =>
											isActive
												? onQuestionActivate(null, null)
												: onQuestionActivate(
														answer.questionId,
														answer.questionPartId,
													)
										}
									/>
								</div>
							)
						})}
					</div>
				</aside>
			</div>

			{/* ── Mobile: stacked threads below image ─────────────────────── */}
			{primaryAnswers.length > 0 && (
				<div className="space-y-2 lg:hidden">
					{primaryAnswers.map((answer) => {
						const isActive =
							answer.questionId === activeQuestionId &&
							(answer.questionPartId ?? null) === (activeQuestionPartId ?? null)
						return (
							<MarkingFeedbackThread
								key={`mobile-${answer.questionId}-${answer.questionPartId ?? ""}`}
								questionId={answer.questionId}
								questionPartId={answer.questionPartId}
								questionText={answer.questionText}
								questionNumber={answer.questionNumber}
								awardedScore={answer.awardedScore}
								maxScore={answer.maxScore}
								feedbackSummary={answer.feedbackSummary}
								llmReasoning={answer.llmReasoning}
								levelAwarded={answer.levelAwarded}
								markPointResults={answer.markPointResults}
								isContinuation={false}
								expanded={isActive}
								isActive={isActive}
								onExpand={() =>
									isActive
										? onQuestionActivate(null, null)
										: onQuestionActivate(
												answer.questionId,
												answer.questionPartId,
											)
								}
							/>
						)
					})}
				</div>
			)}
		</div>
	)
}
