import {
	AbsoluteFill,
	interpolate,
	spring,
	useCurrentFrame,
	useVideoConfig,
} from "remotion"
import { tokens } from "./tokens"

type Props = {
	awarded: number
	max: number
}

export const OUTRO_DURATION = 105

export function OutroCard({ awarded, max }: Props) {
	const frame = useCurrentFrame()
	const { fps } = useVideoConfig()
	const enter = spring({ frame, fps, config: { damping: 18, stiffness: 110 } })

	const tally = Math.round(
		interpolate(frame, [10, 60], [0, awarded], {
			extrapolateLeft: "clamp",
			extrapolateRight: "clamp",
		}),
	)

	return (
		<AbsoluteFill
			style={{
				background: tokens.ink950,
				color: tokens.paper,
				fontFamily: "Geist, system-ui, sans-serif",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				padding: 80,
			}}
		>
			<div
				style={{
					backgroundImage:
						"radial-gradient(rgba(232,230,224,0.08) 1px, transparent 1px)",
					backgroundSize: "22px 22px",
					position: "absolute",
					inset: 0,
				}}
			/>
			<div
				style={{
					position: "relative",
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					gap: 24,
					transform: `translateY(${(1 - enter) * 18}px)`,
					opacity: enter,
				}}
			>
				<div
					style={{
						fontSize: 13,
						letterSpacing: 4,
						textTransform: "uppercase",
						color: tokens.teal,
						fontWeight: 600,
					}}
				>
					Final mark
				</div>
				<div
					style={{
						fontSize: 220,
						lineHeight: 1,
						fontWeight: 600,
						letterSpacing: -6,
						display: "flex",
						alignItems: "baseline",
						gap: 14,
						fontFamily: "Geist Mono, ui-monospace, monospace",
					}}
				>
					<span style={{ color: tokens.paper }}>{tally}</span>
					<span style={{ color: "rgba(232,230,224,0.4)", fontSize: 96 }}>
						/ {max}
					</span>
				</div>
				<div
					style={{
						fontSize: 28,
						color: "rgba(232,230,224,0.78)",
						letterSpacing: -0.4,
						maxWidth: 980,
						textAlign: "center",
						lineHeight: 1.3,
					}}
				>
					Every tick, cross and underline rendered at the exact pixel the marker
					chose. Same data — straight from the database — that the teacher sees.
				</div>
				<div
					style={{
						marginTop: 24,
						fontSize: 18,
						letterSpacing: 6,
						textTransform: "uppercase",
						color: tokens.teal,
					}}
				>
					getdeepmark.com
				</div>
			</div>
		</AbsoluteFill>
	)
}
