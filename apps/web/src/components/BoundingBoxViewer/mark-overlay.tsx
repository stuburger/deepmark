"use client"

import type { MarkPayload, StudentPaperAnnotation } from "@/lib/marking/types"

type Props = {
	annotation: StudentPaperAnnotation & { payload: MarkPayload }
	scaleX: number
	scaleY: number
}

const SIGNAL_COLORS = {
	tick: "#22c55e",
	cross: "#ef4444",
	underline: "#3b82f6",
	double_underline: "#22c55e",
	box: "#a855f7",
	circle: "#f59e0b",
} as const

/**
 * Renders a mark signal (tick/cross/underline/box/circle) on the scanned page.
 * Strokes are bold (6-7px) for clear visibility on scanned handwriting.
 */
export function MarkOverlay({ annotation, scaleX, scaleY }: Props) {
	const { payload, bbox } = annotation
	const [yMin, xMin, yMax, xMax] = bbox
	const color = SIGNAL_COLORS[payload.signal]
	const x = xMin * scaleX
	const y = yMin * scaleY
	const w = (xMax - xMin) * scaleX
	const h = (yMax - yMin) * scaleY

	switch (payload.signal) {
		case "tick":
			return (
				<g>
					<text
						x={x - 18}
						y={y + h * 0.5 + 8}
						fill={color}
						fontSize={Math.max(22, h * 0.9)}
						fontWeight="bold"
					>
						✓
					</text>
					{payload.label && (
						<text x={x + w + 6} y={y + 14} fill={color} fontSize={13} fontWeight="600">
							{payload.label}
						</text>
					)}
				</g>
			)

		case "cross":
			return (
				<g>
					<text
						x={x - 18}
						y={y + h * 0.5 + 8}
						fill={color}
						fontSize={Math.max(22, h * 0.9)}
						fontWeight="bold"
					>
						✗
					</text>
					{payload.label && (
						<text x={x + w + 6} y={y + 14} fill={color} fontSize={13} fontWeight="600">
							{payload.label}
						</text>
					)}
				</g>
			)

		case "underline":
			return (
				<g>
					<line
						x1={x}
						y1={y + h + 3}
						x2={x + w}
						y2={y + h + 3}
						stroke={color}
						strokeWidth={7}
						strokeOpacity={0.9}
						strokeLinecap="round"
					/>
					{payload.label && (
						<text x={x + w + 6} y={y + h} fill={color} fontSize={13} fontWeight="600">
							{payload.label}
						</text>
					)}
				</g>
			)

		case "double_underline":
			return (
				<g>
					<line
						x1={x}
						y1={y + h + 2}
						x2={x + w}
						y2={y + h + 2}
						stroke={color}
						strokeWidth={6}
						strokeOpacity={0.9}
						strokeLinecap="round"
					/>
					<line
						x1={x}
						y1={y + h + 12}
						x2={x + w}
						y2={y + h + 12}
						stroke={color}
						strokeWidth={6}
						strokeOpacity={0.9}
						strokeLinecap="round"
					/>
					{payload.label && (
						<text x={x + w + 6} y={y + h} fill={color} fontSize={13} fontWeight="600">
							{payload.label}
						</text>
					)}
				</g>
			)

		case "box":
			return (
				<g>
					<rect
						x={x - 4}
						y={y - 4}
						width={w + 8}
						height={h + 8}
						fill="none"
						stroke={color}
						strokeWidth={6}
						strokeOpacity={0.8}
						rx={4}
					/>
					{payload.label && (
						<text x={x + w + 10} y={y + 14} fill={color} fontSize={13} fontWeight="600">
							{payload.label}
						</text>
					)}
				</g>
			)

		case "circle":
			return (
				<g>
					<ellipse
						cx={x + w / 2}
						cy={y + h / 2}
						rx={w / 2 + 6}
						ry={h / 2 + 5}
						fill="none"
						stroke={color}
						strokeWidth={6}
						strokeOpacity={0.8}
					/>
					{payload.label && (
						<text x={x + w + 12} y={y + 14} fill={color} fontSize={13} fontWeight="600">
							{payload.label}
						</text>
					)}
				</g>
			)
	}
}
