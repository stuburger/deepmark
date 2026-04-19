"use client"

import {
	type GradingAnnotation,
	annotationColor,
	bboxToPercentStyle,
} from "@/lib/marking/bounding-box"

export function GradingAnnotationOverlay({
	annotation,
	onGradedRegionClick,
}: {
	annotation: GradingAnnotation
	onGradedRegionClick?: (questionNumber: string) => void
}) {
	const [yMin, xMin, yMax, xMax] = annotation.box
	if (yMax === 0 && xMax === 0) return null

	const color = annotationColor(annotation.awardedScore, annotation.maxScore)

	return (
		<button
			type="button"
			aria-label={`Q${annotation.questionNumber}: jump to answer`}
			onClick={() => onGradedRegionClick?.(annotation.questionNumber)}
			className="rounded-sm transition-opacity hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
			style={{
				...bboxToPercentStyle(annotation.box),
				background: "transparent",
				boxShadow: `inset 0 0 0 2px ${color}`,
				padding: 0,
				cursor: "pointer",
			}}
		/>
	)
}
