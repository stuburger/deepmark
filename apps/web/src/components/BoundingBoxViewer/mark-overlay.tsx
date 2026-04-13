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
	TAG_BORDER,
	TAG_CHAR_WIDTH,
	TAG_FONT_SIZE,
	TAG_PADDING_H,
	TAG_PADDING_V,
	TAG_RADIUS,
	UNDERLINE_STROKE,
	overlayUnit,
} from "./overlay-sizing"

type Props = {
	annotation: Extract<StudentPaperAnnotation, { overlay_type: "annotation" }>
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

/** Colour by AO category — blue for knowledge, pink for analysis, green for AO3. */
const AO_COLORS: Record<string, string> = {
	AO1: "#3b82f6",
	AO2: "#ec4899",
	AO3: "#22c55e",
}
const AO_FALLBACK_COLOR = "#6b7280"

/**
 * Renders a mark signal (tick/cross/underline/box/circle) on the scanned page,
 * with an optional AO badge pill when ao_category is present.
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

	// Compute where the label/AO badge goes (right side of bbox)
	const labelX = (() => {
		switch (payload.signal) {
			case "box":
				return x + w + sz * SHAPE_PAD * 2 + sz * OFFSET_H
			case "circle":
				return x + w + sz * CIRCLE_PAD_X + sz * OFFSET_H
			default:
				return x + w + sz * OFFSET_H
		}
	})()

	const labelY = payload.signal === "underline" || payload.signal === "double_underline"
		? y + h
		: y + labelSize

	const signalElement = renderSignal(payload.signal, { x, y, w, h, color, sz, strokeW, thinStrokeW })

	// Label text (if present)
	const labelElement = payload.label ? (
		<text
			x={labelX}
			y={labelY}
			fill={color}
			fontSize={labelSize}
			fontWeight="600"
		>
			{payload.label}
		</text>
	) : null

	// AO badge pill (if ao_category is present)
	const aoElement = payload.ao_category ? (
		<AoBadge
			category={payload.ao_display ?? payload.ao_category}
			x={labelX + (payload.label ? payload.label.length * labelSize * 0.6 + sz * OFFSET_H : 0)}
			y={yMin * scaleY + ((yMax - yMin) * scaleY - sz * TAG_FONT_SIZE) / 2}
			sz={sz}
		/>
	) : null

	return (
		<g>
			{signalElement}
			{labelElement}
			{aoElement}
		</g>
	)
}

type SignalProps = {
	x: number
	y: number
	w: number
	h: number
	color: string
	sz: number
	strokeW: number
	thinStrokeW: number
}

function renderSignal(
	signal: string,
	{ x, y, w, h, color, sz, strokeW, thinStrokeW }: SignalProps,
) {
	switch (signal) {
		case "tick":
			return (
				<text
					x={x - sz * SYMBOL_OFFSET_LEFT}
					y={y + h * 0.5 + sz * SYMBOL_BASELINE}
					fill={color}
					fontSize={sz * MARK_SYMBOL_SIZE}
					fontWeight="bold"
				>
					✓
				</text>
			)

		case "cross":
			return (
				<text
					x={x - sz * SYMBOL_OFFSET_LEFT}
					y={y + h * 0.5 + sz * SYMBOL_BASELINE}
					fill={color}
					fontSize={sz * MARK_SYMBOL_SIZE}
					fontWeight="bold"
				>
					✗
				</text>
			)

		case "underline":
			return (
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
			)

		case "double_underline": {
			const lineY1 = y + h + thinStrokeW
			const lineY2 = lineY1 + sz * DOUBLE_UNDERLINE_GAP
			return (
				<>
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
				</>
			)
		}

		case "box": {
			const pad = sz * SHAPE_PAD
			const boxStroke = sz * SHAPE_STROKE
			return (
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
			)
		}

		case "circle": {
			const circleStroke = sz * SHAPE_STROKE
			const padX = sz * CIRCLE_PAD_X
			const padY = sz * SHAPE_PAD
			return (
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
			)
		}
	}
}

function AoBadge({ category, x, y, sz }: { category: string; x: number; y: number; sz: number }) {
	const fontSize = sz * TAG_FONT_SIZE
	const paddingV = fontSize * TAG_PADDING_V
	const paddingH = fontSize * TAG_PADDING_H
	const pillHeight = fontSize + paddingV * 2
	const borderWidth = sz * TAG_BORDER
	const borderRadius = sz * TAG_RADIUS
	const color = AO_COLORS[category] ?? AO_FALLBACK_COLOR
	const pillWidth = category.length * fontSize * TAG_CHAR_WIDTH + paddingH * 2

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
				{category}
			</text>
		</g>
	)
}
