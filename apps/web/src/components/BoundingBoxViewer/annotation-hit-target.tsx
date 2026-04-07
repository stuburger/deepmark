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
import { createPortal } from "react-dom"

// ─── Props ───────────────────────────────────────────────────────────────────

type Props = {
	annotation: StudentPaperAnnotation
	/** All annotations on this page — used to resolve linked children + parent bbox */
	allAnnotations: StudentPaperAnnotation[]
	/** Called when the annotation is clicked — e.g. to scroll to the question */
	onClick?: () => void
	/** Called when hover state changes on a tag — used to highlight parent mark region */
	onTagHover?: (parentId: string | null) => void
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
	type: string,
): [number, number, number, number] {
	const [yMin, xMin, yMax, xMax] = bbox
	const padY = 10
	const padLeft = type === "mark" ? 30 : 10
	const padRight = type === "tag" ? 20 : 40
	return [
		Math.max(0, yMin - padY),
		Math.max(0, xMin - padLeft),
		Math.min(1000, yMax + padY),
		Math.min(1000, xMax + padRight),
	]
}

// ─── Popover content by type ─────────────────────────────────────────────────

function MarkPopoverContent({
	annotation,
	linked,
}: {
	annotation: StudentPaperAnnotation
	linked: StudentPaperAnnotation[]
}) {
	const payload = annotation.payload as MarkPayload
	const tags = linked.filter((a) => a.overlay_type === "tag")
	const comments = linked.filter((a) => a.overlay_type === "comment")

	const signalSymbol = SIGNAL_SYMBOLS[payload.signal] ?? ""
	const title = payload.reason
		? `${signalSymbol} ${payload.reason}`.trim()
		: payload.label ?? signalSymbol

	return (
		<>
			<PopoverHeader sentiment={annotation.sentiment} title={title} />
			<div className="space-y-2">
				{payload.markPoints && payload.markPoints.length > 0 && (
					<div className="space-y-1">
						{payload.markPoints.map((mp) => (
							<div key={mp.point} className="flex items-start gap-1.5 text-xs">
								<span className={`shrink-0 font-semibold ${mp.awarded ? "text-green-600" : "text-red-500"}`}>
									{mp.awarded ? "✓" : "✗"}
								</span>
								<span className="text-muted-foreground leading-snug">
									{mp.criteria}
								</span>
							</div>
						))}
					</div>
				)}
				<TagList tags={tags} />
				<CommentList comments={comments} />
				{!payload.reason &&
					!payload.markPoints?.length &&
					tags.length === 0 &&
					comments.length === 0 && (
						<p className="text-xs text-muted-foreground italic">{title}</p>
					)}
			</div>
		</>
	)
}

function TagPopoverContent({
	annotation,
	parentAnnotation,
}: {
	annotation: StudentPaperAnnotation
	parentAnnotation: StudentPaperAnnotation | undefined
}) {
	const payload = annotation.payload as TagPayload
	const parentPayload = parentAnnotation?.overlay_type === "mark"
		? (parentAnnotation.payload as MarkPayload)
		: null

	const parentSymbol = parentPayload
		? SIGNAL_SYMBOLS[parentPayload.signal] ?? ""
		: ""
	const parentReason = parentPayload?.reason
		? `${parentSymbol} ${parentPayload.reason}`.trim()
		: parentSymbol

	return (
		<>
			{parentReason && (
				<PopoverHeader sentiment={parentAnnotation?.sentiment ?? null} title={parentReason} />
			)}
			<div className="space-y-2">
				<div className="flex items-start gap-1.5">
					<span className={`inline-flex items-center shrink-0 rounded border px-1.5 py-0.5 text-[11px] font-semibold ${tagColorClass(payload)}`}>
						{payload.display}
					</span>
					{payload.reason && (
						<span className="text-xs text-muted-foreground leading-snug">
							{payload.reason}
						</span>
					)}
				</div>
			</div>
		</>
	)
}

function ChainPopoverContent({
	annotation,
}: {
	annotation: StudentPaperAnnotation
}) {
	const payload = annotation.payload as ChainPayload
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

function TagList({ tags }: { tags: StudentPaperAnnotation[] }) {
	if (tags.length === 0) return null
	return (
		<div className="space-y-1">
			{tags.map((t) => {
				const tp = t.payload as TagPayload
				return (
					<div key={t.id} className="flex items-start gap-1.5">
						<span className={`inline-flex items-center shrink-0 rounded border px-1.5 py-0.5 text-[11px] font-semibold ${tagColorClass(tp)}`}>
							{tp.display}
						</span>
						{tp.reason && (
							<span className="text-xs text-muted-foreground leading-snug">
								{tp.reason}
							</span>
						)}
					</div>
				)
			})}
		</div>
	)
}

function CommentList({ comments }: { comments: StudentPaperAnnotation[] }) {
	if (comments.length === 0) return null
	return (
		<>
			{comments.map((c) => (
				<p
					key={c.id}
					className="text-xs leading-snug text-muted-foreground border-l-2 border-zinc-300 dark:border-zinc-600 pl-2"
				>
					{(c.payload as CommentPayload).text}
				</p>
			))}
		</>
	)
}

function tagColorClass(tp: TagPayload): string {
	if (tp.quality === "strong" || tp.quality === "valid")
		return "text-green-700 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-950 dark:border-green-800"
	if (tp.quality === "partial")
		return "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950 dark:border-amber-800"
	return "text-red-700 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950 dark:border-red-800"
}

// ─── Main component ──────────────────────────────────────────────────────────

/**
 * Unified interaction target for a single annotation. Replaces the old split
 * between AnnotationPopover (HTML buttons for marks/chains) and TagOverlay
 * SVG `pointerEvents="auto"` hack.
 *
 * One HTML div per annotation, absolutely positioned over the scan using
 * percent-based bbox coordinates. Handles click (popover) and hover (tag
 * parent highlight) in a single z-layer.
 */
export function AnnotationHitTarget({
	annotation,
	allAnnotations,
	onClick,
	onTagHover,
}: Props) {
	const [open, setOpen] = useState(false)
	const [clickPos, setClickPos] = useState({ x: 0, y: 0 })
	const panelRef = useRef<HTMLDivElement>(null)

	const isTag = annotation.overlay_type === "tag"

	const hitBbox = expandedBbox(annotation.bbox, annotation.overlay_type)

	const handleClick = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation()
			setClickPos({ x: e.clientX, y: e.clientY })
			setOpen((prev) => !prev)
			onClick?.()
		},
		[onClick],
	)

	const handleMouseEnter = useCallback(() => {
		if (isTag && annotation.parent_annotation_id) {
			onTagHover?.(annotation.parent_annotation_id)
		}
	}, [isTag, annotation.parent_annotation_id, onTagHover])

	const handleMouseLeave = useCallback(() => {
		if (isTag) {
			onTagHover?.(null)
		}
	}, [isTag, onTagHover])

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

	// Resolve linked annotations for marks
	const linked = annotation.overlay_type === "mark"
		? allAnnotations.filter((c) => c.parent_annotation_id === annotation.id)
		: []

	// Resolve parent for tags
	const parentAnnotation = isTag && annotation.parent_annotation_id
		? allAnnotations.find((a) => a.id === annotation.parent_annotation_id)
		: undefined

	return (
		<>
			<div
				role="button"
				tabIndex={0}
				onClick={handleClick}
				onMouseEnter={handleMouseEnter}
				onMouseLeave={handleMouseLeave}
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
						{annotation.overlay_type === "mark" && (
							<MarkPopoverContent annotation={annotation} linked={linked} />
						)}
						{annotation.overlay_type === "tag" && (
							<TagPopoverContent
								annotation={annotation}
								parentAnnotation={parentAnnotation}
							/>
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
