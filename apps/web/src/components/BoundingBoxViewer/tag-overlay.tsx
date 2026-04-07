"use client"

import type { StudentPaperAnnotation, TagPayload } from "@/lib/marking/types"
import {
	OFFSET_H,
	TAG_BORDER,
	TAG_CHAR_WIDTH,
	TAG_FONT_SIZE,
	TAG_PADDING_H,
	TAG_PADDING_V,
	TAG_RADIUS,
	overlayUnit,
} from "./overlay-sizing"

type Props = {
	annotation: StudentPaperAnnotation & { payload: TagPayload }
	/** Parent mark's bbox for positioning — tag renders offset from parent */
	parentBbox?: [number, number, number, number]
	scaleX: number
	scaleY: number
}

/** Colour by AO category — blue for knowledge, pink for analysis, green for AO3. */
const AO_COLORS: Record<string, string> = {
	AO1: "#3b82f6", // blue-500
	AO2: "#ec4899", // pink-500
	AO3: "#22c55e", // green-500
}
const AO_FALLBACK_COLOR = "#6b7280" // gray-500

/**
 * Renders an AO skill tag badge (e.g. "AO2") colour-coded by assessment
 * objective. Purely visual — all interaction is handled by AnnotationHitTarget.
 */
export function TagOverlay({ annotation, parentBbox, scaleX, scaleY }: Props) {
	const { payload, bbox } = annotation
	const refBbox = parentBbox ?? bbox
	const [yMin, , yMax, xMax] = refBbox

	const sz = overlayUnit(scaleY)
	const fontSize = sz * TAG_FONT_SIZE
	const paddingV = fontSize * TAG_PADDING_V
	const paddingH = fontSize * TAG_PADDING_H
	const pillHeight = fontSize + paddingV * 2
	const borderWidth = sz * TAG_BORDER
	const borderRadius = sz * TAG_RADIUS

	// Position the tag to the right of the parent bbox, vertically centred
	const markHeight = (yMax - yMin) * scaleY
	const x = xMax * scaleX + sz * OFFSET_H
	const y = yMin * scaleY + (markHeight - pillHeight) / 2

	const color = AO_COLORS[payload.display] ?? AO_FALLBACK_COLOR
	const label = payload.display

	const pillWidth = label.length * fontSize * TAG_CHAR_WIDTH + paddingH * 2

	return (
		<g>
			<rect
				x={x}
				y={y}
				width={pillWidth}
				height={pillHeight}
				rx={borderRadius}
				fill={color}
				fillOpacity={0.15}
				stroke={color}
				strokeWidth={borderWidth}
				strokeOpacity={0.6}
			/>
			<text
				x={x + pillWidth / 2}
				y={y + fontSize + paddingV * 0.5}
				fill={color}
				fontSize={fontSize}
				fontWeight="700"
				fontFamily="system-ui, sans-serif"
				textAnchor="middle"
			>
				{label}
			</text>
		</g>
	)
}
