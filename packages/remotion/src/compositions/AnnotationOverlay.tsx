import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion"
import type { Annotation } from "../data/types"
import { tokens } from "./tokens"

type Props = {
	annotation: Annotation
	enterDelayFrames: number
}

// Bbox is [yMin, xMin, yMax, xMax] normalised 0–1000 — convert to percentage of
// the page surface so the overlay sits exactly where the marker pointed.
function bboxToStyle(bbox: Annotation["bbox"]) {
	const [yMin, xMin, yMax, xMax] = bbox
	return {
		top: `${yMin / 10}%`,
		left: `${xMin / 10}%`,
		width: `${(xMax - xMin) / 10}%`,
		height: `${(yMax - yMin) / 10}%`,
	} as const
}

function colorForSentiment(sentiment: Annotation["sentiment"]) {
	if (sentiment === "negative") return tokens.error
	if (sentiment === "neutral") return tokens.warning
	return tokens.success
}

export function AnnotationOverlay({ annotation, enterDelayFrames }: Props) {
	const frame = useCurrentFrame()
	const { fps } = useVideoConfig()

	const local = frame - enterDelayFrames
	if (local < 0) return null

	const progress = spring({
		frame: local,
		fps,
		config: { damping: 14, stiffness: 140, mass: 0.7 },
	})
	const drawProgress = interpolate(local, [0, 18], [0, 1], {
		extrapolateRight: "clamp",
	})

	const color = colorForSentiment(annotation.sentiment)
	const style = bboxToStyle(annotation.bbox)

	return (
		<div
			style={{
				position: "absolute",
				...style,
				opacity: progress,
				transform: `scale(${0.96 + 0.04 * progress})`,
				transformOrigin: "left center",
				pointerEvents: "none",
			}}
		>
			<SignalShape
				signal={annotation.signal}
				color={color}
				draw={drawProgress}
			/>
		</div>
	)
}

function SignalShape({
	signal,
	color,
	draw,
}: {
	signal: Annotation["signal"]
	color: string
	draw: number
}) {
	if (signal === "underline" || signal === "double_underline") {
		// Hand-drawn-feeling underline anchored to the baseline of the bbox.
		const pathLength = 100
		const visible = pathLength * draw
		return (
			<svg
				viewBox="0 0 100 20"
				preserveAspectRatio="none"
				style={{
					position: "absolute",
					left: 0,
					right: 0,
					bottom: -2,
					width: "100%",
					height: "30%",
					overflow: "visible",
				}}
			>
				<path
					d="M0,14 Q25,10 50,13 T100,12"
					stroke={color}
					strokeWidth={2.4}
					fill="none"
					strokeLinecap="round"
					pathLength={pathLength}
					strokeDasharray={`${visible} ${pathLength}`}
				/>
				{signal === "double_underline" && (
					<path
						d="M0,18 Q25,15 50,17 T100,16"
						stroke={color}
						strokeWidth={1.8}
						fill="none"
						strokeLinecap="round"
						pathLength={pathLength}
						strokeDasharray={`${visible} ${pathLength}`}
					/>
				)}
			</svg>
		)
	}

	if (signal === "box") {
		const total = 400
		const visible = total * draw
		return (
			<svg
				viewBox="0 0 100 60"
				preserveAspectRatio="none"
				style={{
					position: "absolute",
					inset: 0,
					width: "100%",
					height: "100%",
					overflow: "visible",
				}}
			>
				<rect
					x={1}
					y={1}
					width={98}
					height={58}
					rx={2}
					stroke={color}
					strokeWidth={1.8}
					fill="none"
					pathLength={total}
					strokeDasharray={`${visible} ${total}`}
				/>
			</svg>
		)
	}

	if (signal === "circle") {
		const total = 240
		const visible = total * draw
		return (
			<svg
				viewBox="0 0 100 60"
				preserveAspectRatio="none"
				style={{
					position: "absolute",
					inset: "-6%",
					width: "112%",
					height: "112%",
					overflow: "visible",
				}}
			>
				<ellipse
					cx={50}
					cy={30}
					rx={48}
					ry={26}
					stroke={color}
					strokeWidth={1.8}
					fill="none"
					pathLength={total}
					strokeDasharray={`${visible} ${total}`}
				/>
			</svg>
		)
	}

	if (signal === "tick") {
		return (
			<MarginGlyph color={color} draw={draw}>
				<path
					d="M6,14 L11,19 L22,7"
					stroke={color}
					strokeWidth={3}
					fill="none"
					strokeLinecap="round"
					strokeLinejoin="round"
					pathLength={40}
					strokeDasharray={`${40 * draw} 40`}
				/>
			</MarginGlyph>
		)
	}

	if (signal === "cross") {
		return (
			<MarginGlyph color={color} draw={draw}>
				<path
					d="M7,7 L21,21"
					stroke={color}
					strokeWidth={3}
					fill="none"
					strokeLinecap="round"
					pathLength={20}
					strokeDasharray={`${20 * draw} 20`}
				/>
				<path
					d="M21,7 L7,21"
					stroke={color}
					strokeWidth={3}
					fill="none"
					strokeLinecap="round"
					pathLength={20}
					strokeDasharray={`${20 * draw} 20`}
				/>
			</MarginGlyph>
		)
	}

	return null
}

function MarginGlyph({
	color,
	draw,
	children,
}: {
	color: string
	draw: number
	children: React.ReactNode
}) {
	return (
		<svg
			viewBox="0 0 28 28"
			style={{
				position: "absolute",
				left: "-44px",
				top: "50%",
				transform: "translateY(-50%)",
				width: 38,
				height: 38,
				filter: `drop-shadow(0 1px 0 ${color}22)`,
				opacity: 0.4 + 0.6 * draw,
			}}
		>
			{children}
		</svg>
	)
}
