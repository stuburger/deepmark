import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { Annotation } from "../data/types";
import { tokens } from "./tokens";

type Props = {
	annotation: Annotation;
	enterDelayFrames: number;
	exitFrame: number;
};

function colorForSentiment(sentiment: Annotation["sentiment"]) {
	if (sentiment === "negative")
		return { fg: tokens.error, bg: tokens.errorSoft, dot: tokens.error };
	if (sentiment === "neutral")
		return { fg: tokens.warning, bg: tokens.warningSoft, dot: tokens.warning };
	return { fg: tokens.success, bg: tokens.successSoft, dot: tokens.success };
}

// Comment card that pops in next to the annotation; lives in the side rail
// so the page itself stays legible.
export function AnnotationCallout({
	annotation,
	enterDelayFrames,
	exitFrame,
}: Props) {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const local = frame - enterDelayFrames;
	if (local < 0 || frame > exitFrame) return null;

	const enter = spring({
		frame: local,
		fps,
		config: { damping: 16, stiffness: 150, mass: 0.8 },
	});
	const exit = interpolate(frame, [exitFrame - 12, exitFrame], [1, 0], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
	});
	const opacity = Math.min(enter, exit);
	const translateY = (1 - enter) * 14;

	const palette = colorForSentiment(annotation.sentiment);
	const headline = annotation.comment ?? annotation.reason;

	return (
		<div
			style={{
				opacity,
				transform: `translateY(${translateY}px)`,
				background: tokens.card,
				border: `1px solid ${tokens.border}`,
				borderLeft: `4px solid ${palette.dot}`,
				borderRadius: 8,
				padding: "14px 18px",
				boxShadow: "5px 5px 0 0 rgba(26,26,26,0.04)",
				display: "flex",
				flexDirection: "column",
				gap: 6,
				maxWidth: 420,
				color: tokens.ink950,
				fontFamily: "Geist, system-ui, sans-serif",
			}}
		>
			{annotation.aoDisplay && (
				<div
					style={{
						fontSize: 12,
						letterSpacing: 0.6,
						textTransform: "uppercase",
						color: palette.fg,
						fontWeight: 600,
					}}
				>
					{annotation.aoDisplay}
					{annotation.aoQuality ? ` · ${annotation.aoQuality}` : ""}
				</div>
			)}
			<div style={{ fontSize: 17, lineHeight: 1.35, fontWeight: 500 }}>
				{headline}
			</div>
			{annotation.comment && annotation.reason !== annotation.comment && (
				<div style={{ fontSize: 13, color: tokens.ink700, lineHeight: 1.4 }}>
					{annotation.reason}
				</div>
			)}
		</div>
	);
}
