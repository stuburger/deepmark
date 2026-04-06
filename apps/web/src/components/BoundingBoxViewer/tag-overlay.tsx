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
 * Renders a skill tag badge (e.g. [✓ AO2]) sized proportionally to
 * the parent mark's bounding box height. Positioned to the right of the parent.
 */
export function TagOverlay({ annotation, parentBbox, scaleX, scaleY }: Props) {
	const { payload, bbox } = annotation
	const refBbox = parentBbox ?? bbox
	const [yMin, , yMax, xMax] = refBbox

	// Scale relative to the mark's height so tags look proportional to the text
	const markHeight = (yMax - yMin) * scaleY
	const fontSize = Math.max(8, Math.min(markHeight * 0.7, 14))
	const padding = fontSize * 0.4
	const pillHeight = fontSize + padding * 2

	// Position the tag to the right of the parent bbox, vertically centred
	const x = xMax * scaleX + 4
	const y = yMin * scaleY + (markHeight - pillHeight) / 2

	const color = QUALITY_COLORS[payload.quality] ?? "#6b7280"
	const symbol = payload.awarded ? "✓" : "✗"
	const suffix = QUALITY_SUFFIX[payload.quality] ?? ""
	const label = `${symbol} ${payload.display}${suffix}`

	const pillWidth = label.length * fontSize * 0.6 + padding * 2

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
				strokeWidth={1}
				strokeOpacity={0.6}
			/>
			<text
				x={x + padding}
				y={y + fontSize + padding * 0.5}
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
