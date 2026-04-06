"use client"

import { bboxToPercentStyle } from "@/lib/marking/bounding-box"
import type {
	ChainPayload,
	CommentPayload,
	MarkPayload,
	StudentPaperAnnotation,
	TagPayload,
} from "@/lib/marking/types"
import { cn } from "@/lib/utils"
import { useCallback, useEffect, useRef, useState } from "react"

type Props = {
	annotation: StudentPaperAnnotation
	/** Child annotations (tags + comments) linked to this mark */
	linkedAnnotations: StudentPaperAnnotation[]
	/** Called when the annotation is clicked — used to scroll to the question in the results panel */
	onClick?: () => void
}

const SIGNAL_LABELS: Record<string, string> = {
	tick: "✓ Valid point",
	cross: "✗ Incorrect",
	underline: "Applied knowledge",
	double_underline: "Developed analysis",
	box: "Key term",
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
 * Invisible hit area over a mark or chain annotation. On click, shows a
 * fixed-position card at the click coordinates (immune to CSS transforms
 * from react-zoom-pan-pinch). Click outside or Escape dismisses it.
 */
export function AnnotationPopover({
	annotation,
	linkedAnnotations,
	onClick,
}: Props) {
	const [yMin, xMin, yMax, xMax] = annotation.bbox
	const [open, setOpen] = useState(false)
	const [clickPos, setClickPos] = useState({ x: 0, y: 0 })
	const panelRef = useRef<HTMLDivElement>(null)

	const isMark = annotation.overlay_type === "mark"
	const isChain = annotation.overlay_type === "chain"

	// Expand hit area — marks have tick/cross offset left, tags offset right
	const padY = 10
	const padLeft = isMark ? 30 : 10
	const padRight = 40
	const expandedBbox: [number, number, number, number] = [
		Math.max(0, yMin - padY),
		Math.max(0, xMin - padLeft),
		Math.min(1000, yMax + padY),
		Math.min(1000, xMax + padRight),
	]

	const markPayload = isMark ? (annotation.payload as MarkPayload) : null
	const chainPayload = isChain ? (annotation.payload as ChainPayload) : null

	const title = isMark
		? SIGNAL_LABELS[markPayload?.signal ?? ""] ?? "Annotation"
		: isChain
			? CHAIN_LABELS[chainPayload?.chainType ?? ""] ?? "Chain"
			: "Annotation"

	const tags = linkedAnnotations.filter((a) => a.overlay_type === "tag")
	const comments = linkedAnnotations.filter((a) => a.overlay_type === "comment")

	const handleClick = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation()
			setClickPos({ x: e.clientX, y: e.clientY })
			setOpen((prev) => !prev)
			onClick?.()
		},
		[onClick],
	)

	// Dismiss on click outside or Escape
	useEffect(() => {
		if (!open) return
		const handleOutside = (e: MouseEvent) => {
			if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
				setOpen(false)
			}
		}
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === "Escape") setOpen(false)
		}
		// Delay adding the listener so the opening click doesn't immediately dismiss
		const timer = setTimeout(() => {
			document.addEventListener("mousedown", handleOutside)
			document.addEventListener("keydown", handleEscape)
		}, 0)
		return () => {
			clearTimeout(timer)
			document.removeEventListener("mousedown", handleOutside)
			document.removeEventListener("keydown", handleEscape)
		}
	}, [open])

	// Clamp panel position to stay within viewport
	const panelWidth = 256
	const panelX = Math.min(clickPos.x + 8, window.innerWidth - panelWidth - 16)
	const panelY = Math.min(clickPos.y - 8, window.innerHeight - 200)

	return (
		<>
			{/* Invisible hit area */}
			<button
				type="button"
				aria-label={title}
				onClick={handleClick}
				style={{
					...bboxToPercentStyle(expandedBbox),
					background: "transparent",
					border: "none",
					padding: 0,
					cursor: "pointer",
				}}
			/>

			{/* Fixed-position panel at click coordinates */}
			{open && (
				<div
					ref={panelRef}
					className={cn(
						"fixed z-50 w-64 rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg",
						"animate-in fade-in-0 zoom-in-95",
					)}
					style={{
						left: panelX,
						top: panelY,
					}}
				>
					{/* Header */}
					<div className="flex items-center gap-2 mb-1.5">
						{annotation.sentiment && (
							<span
								className={`h-2 w-2 rounded-full shrink-0 ${SENTIMENT_DOT[annotation.sentiment] ?? SENTIMENT_DOT.neutral}`}
							/>
						)}
						<span className="text-sm font-semibold">{title}</span>
					</div>

					<div className="space-y-2">
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
								<span className="font-medium italic">
									{chainPayload.phrase}
								</span>
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
											? "text-green-700 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-950 dark:border-green-800"
											: tp.quality === "partial"
												? "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950 dark:border-amber-800"
												: "text-red-700 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950 dark:border-red-800"
									return (
										<span
											key={t.id}
											className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${color}`}
										>
											{tp.awarded ? "✓" : "✗"} {tp.display}
											{tp.quality === "strong"
												? "+"
												: tp.quality === "partial"
													? "?"
													: ""}
										</span>
									)
								})}
							</div>
						)}

						{/* Linked comments */}
						{comments.map((c) => (
							<p
								key={c.id}
								className="text-xs leading-snug text-muted-foreground border-l-2 border-zinc-300 dark:border-zinc-600 pl-2"
							>
								{(c.payload as CommentPayload).text}
							</p>
						))}

						{/* Fallback if no linked annotations */}
						{tags.length === 0 &&
							comments.length === 0 &&
							!chainPayload && (
								<p className="text-xs text-muted-foreground italic">{title}</p>
							)}
					</div>
				</div>
			)}
		</>
	)
}
