"use client"

import { aoQualityClass } from "@/lib/marking/ao-palette"
import { bboxToPercentStyle } from "@/lib/marking/bounding-box"
import type { StudentPaperAnnotation } from "@/lib/marking/types"
import { cn } from "@/lib/utils"
import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

// ─── Props ───────────────────────────────────────────────────────────────────

type Props = {
	annotation: StudentPaperAnnotation
	/** Called when the annotation is clicked — e.g. to scroll to the question */
	onClick?: () => void
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SIGNAL_SYMBOLS: Record<string, string> = {
	tick: "✓",
	cross: "✗",
	underline: "—",
	double_underline: "═",
	box: "□",
	circle: "○",
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

// ─── Hit area expansion (normalised 0–1000 units) ────────────────────────────

function expandedBbox(
	bbox: [number, number, number, number],
): [number, number, number, number] {
	const [yMin, xMin, yMax, xMax] = bbox
	const padY = 10
	const padLeft = 30
	const padRight = 40
	return [
		Math.max(0, yMin - padY),
		Math.max(0, xMin - padLeft),
		Math.min(1000, yMax + padY),
		Math.min(1000, xMax + padRight),
	]
}

// ─── Popover content ────────────────────────────────────────────────────────

type SignalAnnotation = Extract<
	StudentPaperAnnotation,
	{ overlay_type: "annotation" }
>
type ChainAnnotation = Extract<
	StudentPaperAnnotation,
	{ overlay_type: "chain" }
>

function AnnotationPopoverContent({
	annotation,
}: { annotation: SignalAnnotation }) {
	const payload = annotation.payload
	const signalSymbol = SIGNAL_SYMBOLS[payload.signal] ?? ""
	const title = payload.reason
		? `${signalSymbol} ${payload.reason}`.trim()
		: (payload.label ?? signalSymbol)

	return (
		<>
			<PopoverHeader sentiment={annotation.sentiment} title={title} />
			<div className="space-y-2">
				{payload.markPoints && payload.markPoints.length > 0 && (
					<div className="space-y-1">
						{payload.markPoints.map((mp) => (
							<div key={mp.point} className="flex items-start gap-1.5 text-xs">
								<span
									className={`shrink-0 font-semibold ${mp.awarded ? "text-green-600" : "text-red-500"}`}
								>
									{mp.awarded ? "✓" : "✗"}
								</span>
								<span className="text-muted-foreground leading-snug">
									{mp.criteria}
								</span>
							</div>
						))}
					</div>
				)}
				{payload.ao_category && (
					<div className="flex items-start gap-1.5">
						<span
							className={`inline-flex items-center shrink-0 rounded border px-1.5 py-0.5 text-[11px] font-semibold ${aoQualityClass(payload.ao_quality)}`}
						>
							{payload.ao_display ?? payload.ao_category}
						</span>
					</div>
				)}
				{payload.comment && (
					<p className="text-xs leading-snug text-muted-foreground border-l-2 border-zinc-300 dark:border-zinc-600 pl-2">
						{payload.comment}
					</p>
				)}
				{!payload.reason &&
					!payload.markPoints?.length &&
					!payload.ao_category &&
					!payload.comment && (
						<p className="text-xs text-muted-foreground italic">{title}</p>
					)}
			</div>
		</>
	)
}

function ChainPopoverContent({ annotation }: { annotation: ChainAnnotation }) {
	const payload = annotation.payload
	const title = CHAIN_LABELS[payload.chainType] ?? "Chain"

	return (
		<>
			<PopoverHeader sentiment={annotation.sentiment} title={title} />
			<p className="text-xs text-muted-foreground">
				&ldquo;
				<span className="font-medium italic">{payload.phrase}</span>
				&rdquo;
			</p>
		</>
	)
}

// ─── Shared sub-components ───────────────────────────────────────────────────

function PopoverHeader({
	sentiment,
	title,
}: {
	sentiment: string | null
	title: string
}) {
	return (
		<div className="flex items-center gap-2 mb-1.5">
			{sentiment && (
				<span
					className={`h-2 w-2 rounded-full shrink-0 ${SENTIMENT_DOT[sentiment] ?? SENTIMENT_DOT.neutral}`}
				/>
			)}
			<span className="text-sm font-semibold">{title}</span>
		</div>
	)
}

// ─── Main component ──────────────────────────────────────────────────────────

/**
 * Unified interaction target for a single annotation. One HTML div per
 * annotation, absolutely positioned over the scan using percent-based
 * bbox coordinates. Handles click to show popover.
 */
export function AnnotationHitTarget({ annotation, onClick }: Props) {
	const [open, setOpen] = useState(false)
	const [clickPos, setClickPos] = useState({ x: 0, y: 0 })
	const panelRef = useRef<HTMLDivElement>(null)

	const hitBbox = expandedBbox(annotation.bbox)

	const handleClick = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation()
			setClickPos({ x: e.clientX, y: e.clientY })
			setOpen((prev) => !prev)
			onClick?.()
		},
		[onClick],
	)

	// Dismiss on click outside, Escape, or scroll
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
		const handleScroll = () => setOpen(false)
		const timer = setTimeout(() => {
			document.addEventListener("mousedown", handleOutside)
			document.addEventListener("keydown", handleEscape)
			window.addEventListener("scroll", handleScroll, true)
		}, 0)
		return () => {
			clearTimeout(timer)
			document.removeEventListener("mousedown", handleOutside)
			document.removeEventListener("keydown", handleEscape)
			window.removeEventListener("scroll", handleScroll, true)
		}
	}, [open])

	// Clamp panel position to viewport
	const panelWidth = 256
	const panelX = Math.min(clickPos.x + 8, window.innerWidth - panelWidth - 16)
	const panelY = Math.min(clickPos.y - 8, window.innerHeight - 200)

	return (
		<>
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: overlay hit target on scan image — not keyboard-navigable */}
			<div
				role="button"
				tabIndex={0}
				onClick={handleClick}
				style={{
					...bboxToPercentStyle(hitBbox),
					background: "transparent",
					border: "none",
					padding: 0,
					cursor: "pointer",
				}}
			/>

			{open &&
				createPortal(
					<div
						ref={panelRef}
						className={cn(
							"fixed z-50 w-64 rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg",
							"animate-in fade-in-0 zoom-in-95",
						)}
						style={{ left: panelX, top: panelY }}
					>
						{annotation.overlay_type === "annotation" && (
							<AnnotationPopoverContent annotation={annotation} />
						)}
						{annotation.overlay_type === "chain" && (
							<ChainPopoverContent annotation={annotation} />
						)}
					</div>,
					document.body,
				)}
		</>
	)
}
