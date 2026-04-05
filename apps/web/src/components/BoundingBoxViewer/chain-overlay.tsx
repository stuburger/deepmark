"use client"

import type { ChainPayload, StudentPaperAnnotation } from "@/lib/marking/types"

type Props = {
	annotation: StudentPaperAnnotation & { payload: ChainPayload }
	scaleX: number
	scaleY: number
}

const CHAIN_COLORS: Record<string, string> = {
	reasoning: "#93c5fd",   // blue-300
	evaluation: "#fcd34d",  // amber-300
	judgement: "#c4b5fd",   // violet-300
}

/**
 * Renders a semi-transparent highlight on connective/reasoning phrases.
 */
export function ChainOverlay({ annotation, scaleX, scaleY }: Props) {
	const { payload, bbox } = annotation
	const [yMin, xMin, yMax, xMax] = bbox
	const color = CHAIN_COLORS[payload.chainType] ?? "#d1d5db"

	return (
		<rect
			x={xMin * scaleX}
			y={yMin * scaleY}
			width={(xMax - xMin) * scaleX}
			height={(yMax - yMin) * scaleY}
			fill={color}
			fillOpacity={0.25}
			stroke="none"
			rx={2}
		/>
	)
}
