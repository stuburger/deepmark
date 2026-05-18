import {
	AbsoluteFill,
	interpolate,
	spring,
	useCurrentFrame,
	useVideoConfig,
} from "remotion"
import { tokens } from "./tokens"

type Props = {
	studentName: string
	paperTitle: string
	awarded: number
	max: number
}

export const INTRO_DURATION = 90

export function IntroCard({ studentName, paperTitle, awarded, max }: Props) {
	const frame = useCurrentFrame()
	const { fps } = useVideoConfig()
	const enter = spring({ frame, fps, config: { damping: 18, stiffness: 110 } })
	const exit = interpolate(
		frame,
		[INTRO_DURATION - 16, INTRO_DURATION],
		[1, 0],
		{ extrapolateLeft: "clamp", extrapolateRight: "clamp" },
	)
	const opacity = Math.min(enter, exit)

	return (
		<AbsoluteFill
			style={{
				background: tokens.paper,
				color: tokens.ink950,
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
						"radial-gradient(rgba(26,26,26,0.08) 1px, transparent 1px)",
					backgroundSize: "20px 20px",
					position: "absolute",
					inset: 0,
				}}
			/>
			<div
				style={{
					position: "relative",
					display: "flex",
					flexDirection: "column",
					gap: 18,
					alignItems: "flex-start",
					opacity,
					transform: `translateY(${(1 - enter) * 18}px)`,
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
					DeepMark · real script, real coordinates
				</div>
				<div
					style={{
						fontSize: 96,
						lineHeight: 1.0,
						fontWeight: 600,
						letterSpacing: -2,
						maxWidth: 1400,
					}}
				>
					Watch us mark{" "}
					<span style={{ color: tokens.teal }}>{studentName}'s</span>{" "}
					{paperTitle}.
				</div>
				<div
					style={{
						display: "flex",
						gap: 28,
						alignItems: "center",
						marginTop: 12,
						fontFamily: "Geist Mono, ui-monospace, monospace",
						color: tokens.ink700,
					}}
				>
					<Stat label="Marks" value={`${awarded} / ${max}`} />
					<Divider />
					<Stat label="Pages" value="12" />
					<Divider />
					<Stat label="Time to mark" value="≈ 4 min" />
				</div>
			</div>
		</AbsoluteFill>
	)
}

function Stat({ label, value }: { label: string; value: string }) {
	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
			<div
				style={{
					fontSize: 11,
					letterSpacing: 1.6,
					textTransform: "uppercase",
					color: tokens.ink500,
				}}
			>
				{label}
			</div>
			<div style={{ fontSize: 28, color: tokens.ink950, fontWeight: 500 }}>
				{value}
			</div>
		</div>
	)
}

function Divider() {
	return (
		<div
			style={{
				width: 1,
				height: 38,
				background: tokens.border,
			}}
		/>
	)
}
