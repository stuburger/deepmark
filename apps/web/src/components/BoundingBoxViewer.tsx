"use client"

import type { HandwritingAnalysis, HandwritingFeature } from "@/lib/scan-actions"
import { cn } from "@/lib/utils"

const FEATURE_COLORS: Record<string, string> = {
	word: "rgb(59 130 246)",
	line: "rgb(34 197 94)",
	paragraph: "rgb(168 85 247)",
	correction: "rgb(239 68 68)",
	"crossing-out": "rgb(249 115 22)",
	diagram: "rgb(20 184 166)",
	punctuation: "rgb(234 179 8)",
}

function getColor(featureType: string): string {
	return FEATURE_COLORS[featureType] ?? "rgb(156 163 175)"
}

type Props = {
	imageUrl: string
	analysis: HandwritingAnalysis
	className?: string
}

export function BoundingBoxViewer({ imageUrl, analysis, className }: Props) {
	const features = analysis.features ?? []

	return (
		<div className={cn("space-y-4", className)}>
			<div className="relative w-full overflow-hidden rounded-lg border bg-muted">
				<img
					src={imageUrl}
					alt="Uploaded handwritten page"
					className="block w-full max-w-full object-contain"
				/>
				<svg
					viewBox="0 0 1000 1000"
					preserveAspectRatio="none"
					className="absolute inset-0 h-full w-full"
					style={{ pointerEvents: "none" }}
				>
					{features.map((f: HandwritingFeature, i: number) => {
						const [yMin, xMin, yMax, xMax] = f.box_2d
						return (
							<rect
								key={i}
								x={xMin}
								y={yMin}
								width={xMax - xMin}
								height={yMax - yMin}
								fill="transparent"
								stroke={getColor(f.feature_type)}
								strokeWidth={8}
							/>
						)
					})}
				</svg>
				<svg
					viewBox="0 0 1000 1000"
					preserveAspectRatio="none"
					className="absolute inset-0 h-full w-full"
					style={{ pointerEvents: "auto" }}
				>
					{features.map((f: HandwritingFeature, i: number) => {
						const [yMin, xMin, yMax, xMax] = f.box_2d
						return (
							<g key={i}>
								<rect
									x={xMin}
									y={yMin}
									width={xMax - xMin}
									height={yMax - yMin}
									fill="transparent"
									stroke="transparent"
									strokeWidth={16}
								/>
								<title>
									[{f.feature_type}] {f.label}
								</title>
							</g>
						)
					})}
				</svg>
			</div>
			<div className="grid gap-4 md:grid-cols-2">
				<div className="rounded-lg border bg-card p-4">
					<h3 className="mb-2 font-medium">Transcript</h3>
					<p className="whitespace-pre-wrap text-sm text-muted-foreground">
						{analysis.transcript || "—"}
					</p>
				</div>
				<div className="rounded-lg border bg-card p-4">
					<h3 className="mb-2 font-medium">Observations</h3>
					<ul className="list-inside list-disc text-sm text-muted-foreground">
						{(analysis.observations ?? []).length > 0
							? analysis.observations.map((o, i) => <li key={i}>{o}</li>)
							: "—"}
					</ul>
				</div>
			</div>
			<div className="rounded-lg border bg-card p-4">
				<h3 className="mb-2 font-medium">Feature legend</h3>
				<div className="flex flex-wrap gap-3 text-xs">
					{Object.entries(FEATURE_COLORS).map(([type, color]) => (
						<span key={type} className="flex items-center gap-1.5">
							<span
								className="inline-block size-3 rounded-sm border border-current/30"
								style={{ backgroundColor: color }}
							/>
							{type}
						</span>
					))}
				</div>
			</div>
		</div>
	)
}
