"use client"

import { aoLabel, aoPillClass, aoQualityClass } from "@/lib/marking/ao-palette"
import { TIPTAP_TO_ENTRY } from "@/lib/marking/mark-registry"
import { cn } from "@/lib/utils"
import type { Editor } from "@tiptap/core"
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react"

// ─── Types ──────────────────────────────────────────────────────────────────

type CommentCard = {
	id: string
	markType: string
	sentiment: string
	reason: string | null
	comment: string | null
	aoCategory: string | null
	aoDisplay: string | null
	aoQuality: string | null
	chainType: string | null
	phrase: string | null
	from: number
	to: number
	topPx: number
}

// ─── Mark type icons ────────────────────────────────────────────────────────

const MARK_ICONS: Record<string, string> = {
	tick: "\u2713",
	cross: "\u2717",
	annotationUnderline: "\u2500",
	doubleUnderline: "\u2550",
	box: "\u25A1",
	circle: "\u25CB",
	chain: "\u26D3",
}

const SENTIMENT_DOT: Record<string, string> = {
	positive: "bg-green-500",
	negative: "bg-red-500",
	neutral: "bg-zinc-400",
}

// ─── Component ──────────────────────────────────────────────────────────────

export function CommentSidebar({
	editor,
	hoveredAnnotationId,
	onHoverAnnotation,
}: {
	editor: Editor
	hoveredAnnotationId?: string | null
	onHoverAnnotation?: (annotationId: string | null) => void
}) {
	const [cards, setCards] = useState<CommentCard[]>([])
	const containerRef = useRef<HTMLDivElement>(null)

	// Extract marks from the PM doc and compute their Y positions
	const recompute = useCallback(() => {
		const { doc } = editor.state
		const newCards: CommentCard[] = []
		const seen = new Set<string>()

		doc.descendants((node, pos) => {
			if (node.type.name !== "questionAnswer") return

			node.forEach((child, childOffset) => {
				if (!child.isText || !child.marks.length) return

				for (const mark of child.marks) {
					const entry = TIPTAP_TO_ENTRY.get(mark.type.name)
					if (!entry) continue

					const attrs = mark.attrs as Record<string, unknown>
					const annotationId = attrs.annotationId as string | null
					const reason = attrs.reason as string | null
					const comment = attrs.comment as string | null

					// Skip marks with no useful content to show
					if (!reason && !comment && !attrs.ao_category) continue

					const from = pos + 1 + childOffset
					const to = from + child.nodeSize
					const key = annotationId ?? `${mark.type.name}-${from}-${to}`

					if (seen.has(key)) continue
					seen.add(key)

					// Get pixel position via coordsAtPos
					let topPx = 0
					try {
						const coords = editor.view.coordsAtPos(from)
						const containerRect =
							containerRef.current?.parentElement?.getBoundingClientRect()
						if (containerRect) {
							topPx = coords.top - containerRect.top
						}
					} catch {
						// coordsAtPos can throw for positions not in the viewport
						continue
					}

					newCards.push({
						id: key,
						markType: mark.type.name,
						sentiment: (attrs.sentiment as string) ?? "neutral",
						reason,
						comment,
						aoCategory: (attrs.ao_category as string) ?? null,
						aoDisplay: (attrs.ao_display as string) ?? null,
						aoQuality: (attrs.ao_quality as string) ?? null,
						chainType: (attrs.chainType as string) ?? null,
						phrase: (attrs.phrase as string) ?? null,
						from,
						to,
						topPx,
					})
				}
			})
		})

		setCards(newCards)
	}, [editor])

	// Recompute on every transaction
	useEffect(() => {
		recompute()
		editor.on("transaction", recompute)
		return () => {
			editor.off("transaction", recompute)
		}
	}, [editor, recompute])

	// Recompute on scroll/resize of the editor's scroll container
	useLayoutEffect(() => {
		const scrollEl = containerRef.current?.closest(
			"[data-slot='scroll-area-viewport']",
		) as HTMLElement | null
		const target = scrollEl ?? window

		const handleReposition = () => recompute()
		target.addEventListener("scroll", handleReposition, { passive: true })

		const observer = new ResizeObserver(handleReposition)
		if (containerRef.current?.parentElement) {
			observer.observe(containerRef.current.parentElement)
		}

		return () => {
			target.removeEventListener("scroll", handleReposition)
			observer.disconnect()
		}
	}, [recompute])

	if (cards.length === 0) return null

	return (
		<div ref={containerRef} className="relative w-full min-h-full">
			{cards.map((card) => {
				const isHovered = hoveredAnnotationId === card.id
				return (
					<div
						key={card.id}
						className={cn(
							"absolute left-0 right-0 mx-1 rounded-md border bg-background px-2 py-1.5 text-[11px] leading-tight shadow-sm transition-all",
							isHovered &&
								"ring-2 ring-yellow-400 bg-yellow-50 dark:bg-yellow-950/30",
						)}
						style={{ top: `${card.topPx}px` }}
						onMouseEnter={() => onHoverAnnotation?.(card.id)}
						onMouseLeave={() => onHoverAnnotation?.(null)}
					>
						<div className="flex items-center gap-1.5 mb-0.5">
							{/* Mark type icon */}
							<span className="text-xs font-bold text-muted-foreground">
								{MARK_ICONS[card.markType] ?? "?"}
							</span>

							{/* Sentiment dot */}
							<span
								className={cn(
									"h-1.5 w-1.5 rounded-full shrink-0",
									SENTIMENT_DOT[card.sentiment] ?? SENTIMENT_DOT.neutral,
								)}
							/>

							{/* AO badge */}
							{card.aoCategory && (
								<span
									className={cn(
										"inline-flex items-center rounded border px-1 py-0 text-[9px] font-semibold leading-none",
										aoPillClass(
											aoLabel({
												ao_display: card.aoDisplay,
												ao_category: card.aoCategory,
											}),
										),
									)}
								>
									{aoLabel({
										ao_display: card.aoDisplay,
										ao_category: card.aoCategory,
									})}
								</span>
							)}

							{/* AO quality */}
							{card.aoQuality && (
								<span
									className={cn(
										"inline-flex items-center rounded border px-1 py-0 text-[9px] font-medium leading-none",
										aoQualityClass(card.aoQuality),
									)}
								>
									{card.aoQuality}
								</span>
							)}
						</div>

						{/* Reason text */}
						{card.reason && (
							<p className="text-muted-foreground line-clamp-2">
								{card.reason}
							</p>
						)}

						{/* Comment text */}
						{card.comment && (
							<p className="text-foreground font-medium line-clamp-2">
								{card.comment}
							</p>
						)}

						{/* Chain phrase */}
						{card.chainType && card.phrase && (
							<p className="text-muted-foreground italic">
								{card.chainType}: {card.phrase}
							</p>
						)}
					</div>
				)
			})}
		</div>
	)
}
