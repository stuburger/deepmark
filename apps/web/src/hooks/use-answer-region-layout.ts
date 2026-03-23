"use client"

import type {
	GradedAnswerOnPage,
	HandwritingFeature,
} from "@/lib/handwriting-types"
import { useMemo } from "react"

export type AnswerAnchor = Pick<
	GradedAnswerOnPage,
	| "extractedAnswerId"
	| "questionId"
	| "questionPartId"
	| "answerRegion"
	| "boundingBoxes"
>

export type LayoutItem = {
	questionId: string
	questionPartId: string | null
	top: number
}

const GAP = 8
const COLLAPSED_HEIGHT = 120
const ACTIVE_HEIGHT = 380
const FALLBACK_STEP = 160

/**
 * Converts a Gemini bounding box coordinate (0–1000 space) to a pixel Y
 * position within the rendered image container.
 */
function geminiYToPixel(y: number, imageHeight: number): number {
	return (y / 1000) * imageHeight
}

/**
 * Returns the pixel Y of the vertical midpoint of an answer region.
 * Falls back to the union of bounding boxes if no refined region is available.
 */
function anchorYForAnswer(answer: AnswerAnchor, imageHeight: number): number {
	if (answer.answerRegion) {
		const [yMin, , yMax] = answer.answerRegion
		return geminiYToPixel((yMin + yMax) / 2, imageHeight)
	}

	const boxes = answer.boundingBoxes as HandwritingFeature[]
	if (boxes.length === 0) return 0

	const yMins = boxes.map((b) => b.box_2d[0])
	const yMaxs = boxes.map((b) => b.box_2d[2])
	const unionYMin = Math.min(...yMins)
	const unionYMax = Math.max(...yMaxs)
	return geminiYToPixel((unionYMin + unionYMax) / 2, imageHeight)
}

export function useAnswerRegionLayout({
	answers,
	imageRenderedHeight,
	activeQuestionId,
	activeQuestionPartId = null,
	cardEstimatedHeight = COLLAPSED_HEIGHT,
}: {
	answers: AnswerAnchor[]
	imageRenderedHeight: number | null
	activeQuestionId: string | null
	activeQuestionPartId?: string | null
	cardEstimatedHeight?: number
}): LayoutItem[] {
	return useMemo(() => {
		if (!imageRenderedHeight || answers.length === 0) return []

		// Build items with ideal anchor positions
		const items = answers.map((answer, index) => {
			const isActive =
				answer.questionId === activeQuestionId &&
				(answer.questionPartId ?? null) === (activeQuestionPartId ?? null)
			return {
				questionId: answer.questionId,
				questionPartId: answer.questionPartId,
				idealTop: anchorYForAnswer(answer, imageRenderedHeight),
				height: isActive ? ACTIVE_HEIGHT : cardEstimatedHeight,
				isActive,
				index,
			}
		})

		// Sort by ideal anchor position
		items.sort((a, b) => a.idealTop - b.idealTop)

		const tops = items.map((item) => item.idealTop)
		const activeIndex = items.findIndex((item) => item.isActive)

		if (activeIndex !== -1) {
			// Active card sits at its natural anchor. Push cards above it up, cards
			// below it down, maintaining minimum gap between all cards.
			tops[activeIndex] = items[activeIndex].idealTop

			for (let i = activeIndex - 1; i >= 0; i--) {
				const maxBottom = (tops[i + 1] ?? 0) - GAP
				const naturalBottom = items[i].idealTop + items[i].height
				tops[i] =
					naturalBottom > maxBottom
						? maxBottom - items[i].height
						: items[i].idealTop
			}

			for (let i = activeIndex + 1; i < items.length; i++) {
				const prevHeight = items[i - 1].height
				const minTop = (tops[i - 1] ?? 0) + prevHeight + GAP
				tops[i] = Math.max(items[i].idealTop, minTop)
			}
		} else {
			// No active card — walk top-to-bottom pushing cards down to avoid overlap
			let previousBottom = Number.NEGATIVE_INFINITY
			for (let i = 0; i < items.length; i++) {
				const minTop = previousBottom + GAP
				tops[i] = Math.max(items[i].idealTop, minTop)
				previousBottom = tops[i] + items[i].height
			}
		}

		return items.map((item, i) => ({
			questionId: item.questionId,
			questionPartId: item.questionPartId,
			top: tops[i] ?? item.idealTop,
		}))
	}, [
		answers,
		imageRenderedHeight,
		activeQuestionId,
		activeQuestionPartId,
		cardEstimatedHeight,
	])
}
