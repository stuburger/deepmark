"use client"

import type { StudentPaperAnnotation, TagPayload } from "@/lib/marking/types"

type Props = {
	annotation: StudentPaperAnnotation & { payload: TagPayload }
	/** Parent mark's bbox for positioning — tag renders offset from parent */
	parentBbox?: [number, number, number, number]
	scaleX: number
	scaleY: number
}

const QUALITY_COLORS: Record<string, string> = {
	strong: "#16a34a",
	valid: "#16a34a",
	partial: "#d97706",
	incorrect: "#dc2626",
}

const QUALITY_SUFFIX: Record<string, string> = {
	strong: "+",
	partial: "?",
	incorrect: "✗",
	valid: "",
}

/**
 * Renders a large, clearly visible skill tag badge (e.g. [✓ AO2])
 * positioned near the parent mark.
 */
export function TagOverlay({ annotation, parentBbox, scaleX, scaleY }: Props) {
	const { payload, bbox } = annotation
	const refBbox = parentBbox ?? bbox
	const [yMin, , , xMax] = refBbox

	// Position the tag to the right of the parent bbox
	const x = xMax * scaleX + 10
	const y = yMin * scaleY - 8

	const color = QUALITY_COLORS[payload.quality] ?? "#6b7280"
	const symbol = payload.awarded ? "✓" : "✗"
	const suffix = QUALITY_SUFFIX[payload.quality] ?? ""
	const label = `${symbol} ${payload.display}${suffix}`

	const fontSize = 40
	const pillWidth = label.length * 26 + 32
	const pillHeight = 56

	return (
		<g>
			<rect
				x={x}
				y={y}
				width={pillWidth}
				height={pillHeight}
				rx={pillHeight / 2}
				fill={color}
				fillOpacity={0.15}
				stroke={color}
				strokeWidth={3}
				strokeOpacity={0.6}
			/>
			<text
				x={x + 16}
				y={y + 40}
				fill={color}
				fontSize={fontSize}
				fontWeight="700"
				fontFamily="system-ui, sans-serif"
			>
				{label}
			</text>
		</g>
	)
}
