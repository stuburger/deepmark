"use client"

import { aoHex } from "@/lib/marking/ao-palette"
import type { PageToken, StudentPaperAnnotation } from "@/lib/marking/types"
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
	/** Full token list for the page — used to compute per-row underlines. */
	tokens?: PageToken[]
}

// ─── Row-hull helpers ────────────────────────────────────────────────────────

function hullBboxes(
	bboxes: [number, number, number, number][],
): [number, number, number, number] {
	let yMin = Number.POSITIVE_INFINITY
	let xMin = Number.POSITIVE_INFINITY
	let yMax = Number.NEGATIVE_INFINITY
	let xMax = Number.NEGATIVE_INFINITY
	for (const [y1, x1, y2, x2] of bboxes) {
		if (y1 < yMin) yMin = y1
		if (x1 < xMin) xMin = x1
		if (y2 > yMax) yMax = y2
		if (x2 > xMax) xMax = x2
	}
	return [yMin, xMin, yMax, xMax]
}

/**
 * Slices the tokens that belong to the annotation's span (by start/end ID)
 * and groups them by Cloud Vision paragraph + line index, returning one
 * hulled bbox per row — sorted top-to-bottom.
 *
 * Falls back to an empty array when token lookup fails (caller uses hull bbox).
 */
function getRowBboxes(
	tokens: PageToken[],
	startId: string | null,
	endId: string | null,
	pageOrder: number,
): [number, number, number, number][] {
	if (!startId || !endId) return []

	const pageTokens = tokens.filter((t) => t.page_order === pageOrder)
	const startIdx = pageTokens.findIndex((t) => t.id === startId)
	const endIdx = pageTokens.findIndex((t) => t.id === endId)
	if (startIdx === -1 || endIdx === -1) return []

	const lo = Math.min(startIdx, endIdx)
	const hi = Math.max(startIdx, endIdx)
	const span = pageTokens.slice(lo, hi + 1)

	// Group by paragraph + line index so multi-paragraph spans are handled correctly
	const lineMap = new Map<string, [number, number, number, number][]>()
	for (const token of span) {
		const key = `${token.para_index}-${token.line_index}`
		if (!lineMap.has(key)) lineMap.set(key, [])
		lineMap.get(key)?.push(token.bbox)
	}

	return [...lineMap.values()]
		.sort((a, b) => a[0][0] - b[0][0]) // sort row groups top-to-bottom by yMin
		.map(hullBboxes)
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
 * Renders a mark signal (tick/cross/underline/box/circle) on the scanned page,
 * with an optional AO badge pill when ao_category is present.
 *
 * For underline/double_underline signals, draws one line per text row so that
 * multi-line annotations are underlined on every row instead of just the bottom.
 */
export function MarkOverlay({ annotation, scaleX, scaleY, tokens }: Props) {
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

	// For underline signals, split into per-row bboxes using page tokens.
	// Falls back to the hull bbox (single row) when tokens aren't available.
	const isUnderlineSig =
		payload.signal === "underline" || payload.signal === "double_underline"
	const rowBboxes: [number, number, number, number][] = isUnderlineSig
		? (tokens &&
				getRowBboxes(
					tokens,
					annotation.anchor_token_start_id,
					annotation.anchor_token_end_id,
					annotation.page_order,
				)) || [[yMin, xMin, yMax, xMax]]
		: [[yMin, xMin, yMax, xMax]]

	// Compute where the label/AO badge goes (right side of hull bbox)
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

	const labelY = isUnderlineSig ? y + h : y + labelSize

	// For underlines, render one signal element per row
	const signalElement = isUnderlineSig ? (
		<>
			{rowBboxes.map((rowBbox, i) => {
				const [rYMin, rXMin, rYMax, rXMax] = rowBbox
				const rx = rXMin * scaleX
				const ry = rYMin * scaleY
				const rw = (rXMax - rXMin) * scaleX
				const rh = (rYMax - rYMin) * scaleY
				return (
					// biome-ignore lint/suspicious/noArrayIndexKey: stable per-row underline
					<g key={i}>
						{renderSignal(payload.signal, {
							x: rx,
							y: ry,
							w: rw,
							h: rh,
							color,
							sz,
							strokeW,
							thinStrokeW,
						})}
					</g>
				)
			})}
		</>
	) : (
		renderSignal(payload.signal, {
			x,
			y,
			w,
			h,
			color,
			sz,
			strokeW,
			thinStrokeW,
		})
	)

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
			x={
				labelX +
				(payload.label
					? payload.label.length * labelSize * 0.6 + sz * OFFSET_H
					: 0)
			}
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

function AoBadge({
	category,
	x,
	y,
	sz,
}: { category: string; x: number; y: number; sz: number }) {
	const fontSize = sz * TAG_FONT_SIZE
	const paddingV = fontSize * TAG_PADDING_V
	const paddingH = fontSize * TAG_PADDING_H
	const pillHeight = fontSize + paddingV * 2
	const borderWidth = sz * TAG_BORDER
	const borderRadius = sz * TAG_RADIUS
	const color = aoHex(category)
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
