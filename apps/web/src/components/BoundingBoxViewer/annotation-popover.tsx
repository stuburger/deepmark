"use client"

import {
	Popover,
	PopoverContent,
	PopoverHeader,
	PopoverTitle,
	PopoverTrigger,
} from "@/components/ui/popover"
import { bboxToPercentStyle } from "@/lib/marking/bounding-box"
import type {
	ChainPayload,
	CommentPayload,
	MarkPayload,
	StudentPaperAnnotation,
	TagPayload,
} from "@/lib/marking/types"

type Props = {
	annotation: StudentPaperAnnotation
	/** Child annotations (tags + comments) linked to this mark */
	linkedAnnotations: StudentPaperAnnotation[]
}

const SIGNAL_LABELS: Record<string, string> = {
	tick: "✓ Valid point",
	cross: "✗ Incorrect",
	underline: "Application (AO2)",
	double_underline: "Analysis (AO3)",
	box: "Key term (AO1)",
	circle: "Unclear/vague",
}

const CHAIN_LABELS: Record<string, string> = {
	reasoning: "Reasoning chain",
	evaluation: "Evaluation",
	judgement: "Judgement",
}

const SENTIMENT_DOT: Record<string, string> = {
	positive: "bg-green-500",
	negative: "bg-red-500",
	neutral: "bg-zinc-400",
}

/**
 * Invisible hit area over a mark or chain annotation that shows a popover
 * with linked tag/comment info on click. Uses percentage-based positioning
 * (bboxToPercentStyle) to match the normalised 0-1000 coordinate system.
 * The hit area has generous padding to make thin underlines easy to click.
 */
export function AnnotationPopover({
	annotation,
	linkedAnnotations,
}: Props) {
	const [yMin, xMin, yMax, xMax] = annotation.bbox

	// Expand hit area — add padding around the bbox (in normalised 0-1000 units)
	const pad = 8
	const expandedBbox: [number, number, number, number] = [
		Math.max(0, yMin - pad),
		Math.max(0, xMin - pad),
		Math.min(1000, yMax + pad),
		Math.min(1000, xMax + pad),
	]

	const isMark = annotation.overlay_type === "mark"
	const isChain = annotation.overlay_type === "chain"

	const markPayload = isMark ? (annotation.payload as MarkPayload) : null
	const chainPayload = isChain ? (annotation.payload as ChainPayload) : null

	const title = isMark
		? SIGNAL_LABELS[markPayload?.signal ?? ""] ?? "Annotation"
		: isChain
			? CHAIN_LABELS[chainPayload?.chainType ?? ""] ?? "Chain"
			: "Annotation"

	const tags = linkedAnnotations.filter((a) => a.overlay_type === "tag")
	const comments = linkedAnnotations.filter((a) => a.overlay_type === "comment")

	return (
		<Popover>
			<PopoverTrigger
				aria-label={title}
				style={{
					...bboxToPercentStyle(expandedBbox),
					background: "transparent",
					border: "none",
					padding: 0,
					cursor: "pointer",
				}}
			/>
			<PopoverContent side="right" sideOffset={8} className="w-64">
				<PopoverHeader>
					<div className="flex items-center gap-2">
						{annotation.sentiment && (
							<span
								className={`h-2 w-2 rounded-full shrink-0 ${SENTIMENT_DOT[annotation.sentiment] ?? SENTIMENT_DOT.neutral}`}
							/>
						)}
						<PopoverTitle className="text-sm font-semibold">
							{title}
						</PopoverTitle>
					</div>
				</PopoverHeader>

				<div className="space-y-2 pt-1">
					{/* Mark label */}
					{markPayload?.label && (
						<p className="text-xs text-muted-foreground">
							Label: <span className="font-medium">{markPayload.label}</span>
						</p>
					)}

					{/* Chain phrase */}
					{chainPayload && (
						<p className="text-xs text-muted-foreground">
							Phrase: &ldquo;
							<span className="font-medium italic">{chainPayload.phrase}</span>
							&rdquo;
						</p>
					)}

					{/* Linked tags */}
					{tags.length > 0 && (
						<div className="flex flex-wrap gap-1">
							{tags.map((t) => {
								const tp = t.payload as TagPayload
								const color =
									tp.quality === "strong" || tp.quality === "valid"
										? "text-green-700 bg-green-50 border-green-200"
										: tp.quality === "partial"
											? "text-amber-700 bg-amber-50 border-amber-200"
											: "text-red-700 bg-red-50 border-red-200"
								return (
									<span
										key={t.id}
										className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${color}`}
									>
										{tp.awarded ? "✓" : "✗"} {tp.display}
										{tp.quality === "strong" ? "+" : tp.quality === "partial" ? "?" : ""}
									</span>
								)
							})}
						</div>
					)}

					{/* Linked comments */}
					{comments.map((c) => (
						<p
							key={c.id}
							className="text-xs leading-snug text-muted-foreground border-l-2 border-zinc-300 pl-2"
						>
							{(c.payload as CommentPayload).text}
						</p>
					))}

					{/* Fallback if no linked annotations */}
					{tags.length === 0 && comments.length === 0 && !chainPayload && (
						<p className="text-xs text-muted-foreground italic">
							{title}
						</p>
					)}
				</div>
			</PopoverContent>
		</Popover>
	)
}
