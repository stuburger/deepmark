import {
	AbsoluteFill,
	Img,
	interpolate,
	spring,
	staticFile,
	useCurrentFrame,
	useVideoConfig,
} from "remotion"
import type { PageScene } from "../data/types"
import { AnnotationCallout } from "./AnnotationCallout"
import { AnnotationOverlay } from "./AnnotationOverlay"
import { tokens } from "./tokens"

type Props = {
	scene: PageScene
}

const PAGE_ENTER_FRAMES = 18
const ANNOTATION_STAGGER = 22
const ANNOTATION_DURATION = 130

export function getPageSceneDuration(scene: PageScene) {
	const lastEnter =
		PAGE_ENTER_FRAMES + (scene.annotations.length - 1) * ANNOTATION_STAGGER
	return lastEnter + ANNOTATION_DURATION + 30
}

export function PageSceneComp({ scene }: Props) {
	const frame = useCurrentFrame()
	const { fps } = useVideoConfig()

	const enter = spring({
		frame,
		fps,
		config: { damping: 18, stiffness: 110, mass: 0.9 },
	})
	const pageOpacity = interpolate(frame, [0, 14], [0, 1], {
		extrapolateRight: "clamp",
	})
	const pageScale = 0.965 + 0.035 * enter

	const tally = computeRunningTally(scene, frame)

	return (
		<AbsoluteFill
			style={{
				background: tokens.paper,
				fontFamily: "Geist, system-ui, sans-serif",
				padding: 48,
				display: "flex",
				flexDirection: "row",
				gap: 48,
			}}
		>
			<DotGrid />
			{/* Left rail — question metadata + annotation comments */}
			<div
				style={{
					width: 460,
					display: "flex",
					flexDirection: "column",
					gap: 18,
					position: "relative",
				}}
			>
				<QuestionHeader scene={scene} tally={tally} />
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						gap: 10,
						marginTop: 6,
					}}
				>
					{scene.annotations.map((annotation, idx) => {
						const enterDelay = PAGE_ENTER_FRAMES + idx * ANNOTATION_STAGGER
						return (
							<AnnotationCallout
								key={idx}
								annotation={annotation}
								enterDelayFrames={enterDelay}
								exitFrame={enterDelay + ANNOTATION_DURATION + 30}
							/>
						)
					})}
				</div>
				<FinalMarkChip scene={scene} />
			</div>

			{/* Right — the page itself with overlays */}
			<div
				style={{
					flex: 1,
					position: "relative",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
				}}
			>
				<div
					style={{
						position: "relative",
						height: "100%",
						aspectRatio: "1193 / 1684",
						transform: `scale(${pageScale})`,
						transformOrigin: "center center",
						opacity: pageOpacity,
						filter: "drop-shadow(8px 8px 0 rgba(26,26,26,0.08))",
					}}
				>
					<Img
						src={staticFile(scene.pageImage)}
						style={{
							width: "100%",
							height: "100%",
							display: "block",
							borderRadius: 4,
							border: `1px solid ${tokens.border}`,
							background: tokens.card,
						}}
					/>
					{scene.annotations.map((annotation, idx) => (
						<AnnotationOverlay
							key={idx}
							annotation={annotation}
							enterDelayFrames={PAGE_ENTER_FRAMES + idx * ANNOTATION_STAGGER}
						/>
					))}
				</div>
			</div>
		</AbsoluteFill>
	)
}

function QuestionHeader({
	scene,
	tally,
}: {
	scene: PageScene
	tally: number
}) {
	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				gap: 10,
				padding: "20px 22px",
				background: tokens.card,
				border: `1px solid ${tokens.border}`,
				borderRadius: 8,
				boxShadow: "5px 5px 0 0 rgba(26,26,26,0.04)",
			}}
		>
			<div
				style={{
					fontSize: 11,
					letterSpacing: 1.5,
					textTransform: "uppercase",
					color: tokens.ink500,
					fontWeight: 600,
				}}
			>
				Question {scene.questionNumber}
			</div>
			<div
				style={{
					fontSize: 18,
					lineHeight: 1.4,
					color: tokens.ink950,
					fontWeight: 500,
				}}
			>
				{scene.questionText}
			</div>
			<div
				style={{
					display: "flex",
					alignItems: "baseline",
					gap: 8,
					marginTop: 4,
					fontFamily: "Geist Mono, ui-monospace, monospace",
				}}
			>
				<span style={{ fontSize: 32, color: tokens.teal, fontWeight: 600 }}>
					{tally}
				</span>
				<span style={{ fontSize: 18, color: tokens.ink500 }}>
					/ {scene.maxMarks}
				</span>
				<span
					style={{
						fontSize: 11,
						letterSpacing: 1,
						textTransform: "uppercase",
						color: tokens.ink500,
						marginLeft: 10,
					}}
				>
					marks awarded
				</span>
			</div>
		</div>
	)
}

function FinalMarkChip({ scene }: { scene: PageScene }) {
	const frame = useCurrentFrame()
	const { fps } = useVideoConfig()
	const total = getPageSceneDuration(scene)
	const local = frame - (total - 65)
	if (local < 0) return null

	const enter = spring({
		frame: local,
		fps,
		config: { damping: 14, stiffness: 130, mass: 0.7 },
	})

	return (
		<div
			style={{
				marginTop: "auto",
				padding: "14px 18px",
				background: tokens.tealSoft,
				border: `1px solid ${tokens.teal}33`,
				borderRadius: 8,
				display: "flex",
				flexDirection: "column",
				gap: 4,
				transform: `translateY(${(1 - enter) * 12}px)`,
				opacity: enter,
			}}
		>
			<div
				style={{
					fontSize: 11,
					letterSpacing: 1.5,
					textTransform: "uppercase",
					color: tokens.tealDark,
					fontWeight: 600,
				}}
			>
				Examiner summary
			</div>
			<div style={{ fontSize: 15, color: tokens.ink950, lineHeight: 1.4 }}>
				{scene.feedbackSummary}
			</div>
		</div>
	)
}

function computeRunningTally(scene: PageScene, frame: number) {
	// Tally ramps up over the duration of the annotation stagger, then locks.
	const lastFrame =
		PAGE_ENTER_FRAMES + (scene.annotations.length - 1) * ANNOTATION_STAGGER + 20
	const t = interpolate(frame, [PAGE_ENTER_FRAMES, lastFrame], [0, 1], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
	})
	return Math.round(t * scene.awarded)
}

function DotGrid() {
	return (
		<div
			style={{
				position: "absolute",
				inset: 0,
				backgroundImage:
					"radial-gradient(rgba(26,26,26,0.10) 1px, transparent 1px)",
				backgroundSize: "18px 18px",
				backgroundPosition: "0 0",
				pointerEvents: "none",
				zIndex: 0,
			}}
		/>
	)
}
