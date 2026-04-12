"use client"

import type { StudentPaperAnnotation } from "@/lib/marking/types"
import {
	CIRCLE_PAD_X,
	DOUBLE_UNDERLINE_GAP,
	DOUBLE_UNDERLINE_STROKE,
	LABEL_SIZE,
	MARK_SYMBOL_SIZE,
	OFFSET_H,
	SHAPE_PAD,
	SHAPE_STROKE,
	SYMBOL_BASELINE,
	SYMBOL_OFFSET_LEFT,
	UNDERLINE_STROKE,
	overlayUnit,
} from "./overlay-sizing"

type Props = {
	annotation: Extract<StudentPaperAnnotation, { overlay_type: "mark" }>
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
 *
 * All sizes derive from the resolution-independent `overlayUnit()`. See
 * `overlay-sizing.ts` for the named constants and their rationale.
 */
export function MarkOverlay({ annotation, scaleX, scaleY }: Props) {
	const { payload, bbox } = annotation
	const [yMin, xMin, yMax, xMax] = bbox
	const color = SIGNAL_COLORS[payload.signal]
	const x = xMin * scaleX
	const y = yMin * scaleY
	const w = (xMax - xMin) * scaleX
	const h = (yMax - yMin) * scaleY

	const sz = overlayUnit(scaleY)
	const strokeW = sz * UNDERLINE_STROKE
	const thinStrokeW = sz * DOUBLE_UNDERLINE_STROKE
	const labelSize = sz * LABEL_SIZE

	switch (payload.signal) {
		case "tick":
			return (
				<g>
					<text
						x={x - sz * SYMBOL_OFFSET_LEFT}
						y={y + h * 0.5 + sz * SYMBOL_BASELINE}
						fill={color}
						fontSize={sz * MARK_SYMBOL_SIZE}
						fontWeight="bold"
					>
						✓
					</text>
					{payload.label && (
						<text
							x={x + w + sz * OFFSET_H}
							y={y + labelSize}
							fill={color}
							fontSize={labelSize}
							fontWeight="600"
						>
							{payload.label}
						</text>
					)}
				</g>
			)

		case "cross":
			return (
				<g>
					<text
						x={x - sz * SYMBOL_OFFSET_LEFT}
						y={y + h * 0.5 + sz * SYMBOL_BASELINE}
						fill={color}
						fontSize={sz * MARK_SYMBOL_SIZE}
						fontWeight="bold"
					>
						✗
					</text>
					{payload.label && (
						<text
							x={x + w + sz * OFFSET_H}
							y={y + labelSize}
							fill={color}
							fontSize={labelSize}
							fontWeight="600"
						>
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
						y1={y + h + strokeW}
						x2={x + w}
						y2={y + h + strokeW}
						stroke={color}
						strokeWidth={strokeW}
						strokeOpacity={0.9}
						strokeLinecap="round"
					/>
					{payload.label && (
						<text
							x={x + w + sz * OFFSET_H}
							y={y + h}
							fill={color}
							fontSize={labelSize}
							fontWeight="600"
						>
							{payload.label}
						</text>
					)}
				</g>
			)

		case "double_underline": {
			const lineY1 = y + h + thinStrokeW
			const lineY2 = lineY1 + sz * DOUBLE_UNDERLINE_GAP
			return (
				<g>
					<line
						x1={x}
						y1={lineY1}
						x2={x + w}
						y2={lineY1}
						stroke={color}
						strokeWidth={thinStrokeW}
						strokeOpacity={0.9}
						strokeLinecap="round"
					/>
					<line
						x1={x}
						y1={lineY2}
						x2={x + w}
						y2={lineY2}
						stroke={color}
						strokeWidth={thinStrokeW}
						strokeOpacity={0.9}
						strokeLinecap="round"
					/>
					{payload.label && (
						<text
							x={x + w + sz * OFFSET_H}
							y={y + h}
							fill={color}
							fontSize={labelSize}
							fontWeight="600"
						>
							{payload.label}
						</text>
					)}
				</g>
			)
		}

		case "box": {
			const pad = sz * SHAPE_PAD
			const boxStroke = sz * SHAPE_STROKE
			return (
				<g>
					<rect
						x={x - pad}
						y={y - pad}
						width={w + pad * 2}
						height={h + pad * 2}
						fill="none"
						stroke={color}
						strokeWidth={boxStroke}
						strokeOpacity={0.8}
						rx={pad}
					/>
					{payload.label && (
						<text
							x={x + w + pad * 2 + sz * OFFSET_H}
							y={y + labelSize}
							fill={color}
							fontSize={labelSize}
							fontWeight="600"
						>
							{payload.label}
						</text>
					)}
				</g>
			)
		}

		case "circle": {
			const circleStroke = sz * SHAPE_STROKE
			const padX = sz * CIRCLE_PAD_X
			const padY = sz * SHAPE_PAD
			return (
				<g>
					<ellipse
						cx={x + w / 2}
						cy={y + h / 2}
						rx={w / 2 + padX}
						ry={h / 2 + padY}
						fill="none"
						stroke={color}
						strokeWidth={circleStroke}
						strokeOpacity={0.8}
					/>
					{payload.label && (
						<text
							x={x + w + padX + sz * OFFSET_H}
							y={y + labelSize}
							fill={color}
							fontSize={labelSize}
							fontWeight="600"
						>
							{payload.label}
						</text>
					)}
				</g>
			)
		}
	}
}
