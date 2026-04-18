"use client"

import { aoLabel, aoPillClass, aoQualityClass } from "@/lib/marking/ao-palette"
import { TIPTAP_TO_ENTRY } from "@/lib/marking/mark-registry"
import { cn } from "@/lib/utils"
import type { Editor } from "@tiptap/core"
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
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
	idealY: number
}

// ─── Constants ──────────────────────────────────────────────────────────────

const MARK_ICONS: Record<string, string> = {
	tick: "\u2713",
	cross: "\u2717",
	annotationUnderline: "\u2500",
	doubleUnderline: "\u2550",
	box: "\u25A1",
	circle: "\u25CB",
	chain: "\u26D3",
}

const MARK_LABELS: Record<string, string> = {
	tick: "Tick",
	cross: "Cross",
	annotationUnderline: "Underline",
	doubleUnderline: "Double underline",
	box: "Box",
	circle: "Circle",
	chain: "Chain",
}

const SENTIMENT_DOT: Record<string, string> = {
	positive: "bg-green-500",
	negative: "bg-red-500",
	neutral: "bg-zinc-400",
}

const SENTIMENTS = ["positive", "neutral", "negative"] as const

const CARD_HEIGHT_PX = 36
const CARD_GAP_PX = 4
/** Extra space the expanded card needs beyond its collapsed height */
const EXPAND_OFFSET_PX = 130

// ─── Layout ─────────────────────────────────────────────────────────────────

/** Stack cards top-down, pushing any that would overlap. Stable — no reflow on active change. */
function layoutCards(
	cards: CommentCard[],
): Array<{ card: CommentCard; topPx: number }> {
	if (cards.length === 0) return []

	const sorted = [...cards].sort((a, b) => a.idealY - b.idealY)
	const result: Array<{ card: CommentCard; topPx: number }> = []
	const step = CARD_HEIGHT_PX + CARD_GAP_PX

	let nextY = Number.NEGATIVE_INFINITY
	for (const card of sorted) {
		const y = Math.max(card.idealY, nextY)
		result.push({ card, topPx: y })
		nextY = y + step
	}
	return result
}

// ─── Mark attr updater ──────────────────────────────────────────────────────

function updateMarkAttr(
	editor: Editor,
	card: CommentCard,
	attrs: Record<string, unknown>,
) {
	const markType = editor.schema.marks[card.markType]
	if (!markType) return

	// Read existing attrs from the doc at this position, merge with new ones
	const { doc } = editor.state
	const resolvedNode = doc.nodeAt(card.from)
	if (!resolvedNode) return

	const existingMark = resolvedNode.marks.find(
		(m) => m.type.name === card.markType,
	)
	if (!existingMark) return

	const newMark = markType.create({ ...existingMark.attrs, ...attrs })
	const tr = editor.state.tr.addMark(card.from, card.to, newMark)
	editor.view.dispatch(tr)
}

function removeMark(editor: Editor, card: CommentCard) {
	const markType = editor.schema.marks[card.markType]
	if (!markType) return

	const tr = editor.state.tr.removeMark(card.from, card.to, markType)
	editor.view.dispatch(tr)
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
	const [rawCards, setRawCards] = useState<CommentCard[]>([])
	const containerRef = useRef<HTMLDivElement>(null)

	const recompute = useCallback(() => {
		const { doc } = editor.state

		// Pass 1: collect all mark fragments with their positions
		type Fragment = {
			markType: string
			attrs: Record<string, unknown>
			from: number
			to: number
		}
		const fragments: Fragment[] = []

		doc.descendants((node, pos) => {
			if (node.type.name !== "questionAnswer") return

			node.forEach((child, childOffset) => {
				if (!child.isText || !child.marks.length) return

				for (const mark of child.marks) {
					if (!TIPTAP_TO_ENTRY.has(mark.type.name)) continue
					fragments.push({
						markType: mark.type.name,
						attrs: mark.attrs as Record<string, unknown>,
						from: pos + 1 + childOffset,
						to: pos + 1 + childOffset + child.nodeSize,
					})
				}
			})
		})

		// Pass 2: merge contiguous fragments of the same mark.
		// AI marks: group by annotationId.
		// Teacher marks: group by markType + attrs identity (adjacent fragments
		// of the same mark type with matching attrs are the same logical mark).
		const merged = new Map<
			string,
			{
				markType: string
				attrs: Record<string, unknown>
				from: number
				to: number
			}
		>()

		for (const frag of fragments) {
			const annotationId = frag.attrs.annotationId as string | null

			// Build a stable identity key that doesn't depend on position.
			// For AI marks the annotationId is unique. For teacher marks, use
			// type + serialised attrs so contiguous fragments coalesce.
			const identity = annotationId
				? annotationId
				: `${frag.markType}|${frag.attrs.sentiment ?? ""}|${frag.attrs.reason ?? ""}|${frag.attrs.comment ?? ""}`

			const existing = merged.get(identity)
			if (existing && frag.from <= existing.to) {
				// Extend the range — contiguous or overlapping fragment
				existing.to = Math.max(existing.to, frag.to)
			} else if (!existing) {
				merged.set(identity, { ...frag })
			}
			// Non-contiguous fragment with same identity = genuinely separate mark
			// (e.g. two separate ticks with no reason). Use position-qualified key.
			else {
				merged.set(`${identity}@${frag.from}`, { ...frag })
			}
		}

		// Pass 3: build cards with pixel positions
		const newCards: CommentCard[] = []
		for (const [key, m] of merged) {
			let idealY = 0
			try {
				const coords = editor.view.coordsAtPos(m.from)
				const containerRect =
					containerRef.current?.parentElement?.getBoundingClientRect()
				if (containerRect) {
					idealY = coords.top - containerRect.top
				}
			} catch {
				continue
			}

			newCards.push({
				id: key,
				markType: m.markType,
				sentiment: (m.attrs.sentiment as string) ?? "neutral",
				reason: (m.attrs.reason as string) ?? null,
				comment: (m.attrs.comment as string) ?? null,
				aoCategory: (m.attrs.ao_category as string) ?? null,
				aoDisplay: (m.attrs.ao_display as string) ?? null,
				aoQuality: (m.attrs.ao_quality as string) ?? null,
				chainType: (m.attrs.chainType as string) ?? null,
				phrase: (m.attrs.phrase as string) ?? null,
				from: m.from,
				to: m.to,
				idealY,
			})
		}

		setRawCards(newCards)
	}, [editor])

	useEffect(() => {
		recompute()
		editor.on("transaction", recompute)
		return () => {
			editor.off("transaction", recompute)
		}
	}, [editor, recompute])

	// Layout-change observer: the editor's QuestionAnswerNode uses a React
	// NodeView that mounts *after* the PM transaction commits. On first load
	// (and whenever doc content changes via stage-sync) the NodeView DOM
	// isn't yet in the tree when `recompute` first runs, so coordsAtPos
	// returns approximately the editor's top for every position and cards
	// stack at the top. Watching the editor DOM for size changes catches
	// each NodeView mount and triggers a repositioning pass with the
	// correct coordinates.
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
		observer.observe(editor.view.dom)

		return () => {
			target.removeEventListener("scroll", handleReposition)
			observer.disconnect()
		}
	}, [editor, recompute])

	const positioned = useMemo(() => layoutCards(rawCards), [rawCards])

	if (positioned.length === 0) return null

	// Compute translateY offsets: cards below the active one shift down
	// to make room for the expanded card. Uses transform for GPU animation.
	const activeIdx = hoveredAnnotationId
		? positioned.findIndex(({ card }) => card.id === hoveredAnnotationId)
		: -1
	const activeTopPx = activeIdx >= 0 ? positioned[activeIdx].topPx : 0

	return (
		<div ref={containerRef} className="relative w-full min-h-full">
			{positioned.map(({ card, topPx }, idx) => {
				const isActive = hoveredAnnotationId === card.id
				// Push cards below the active one down
				const offsetY =
					activeIdx >= 0 &&
					idx > activeIdx &&
					topPx < activeTopPx + EXPAND_OFFSET_PX + CARD_HEIGHT_PX
						? EXPAND_OFFSET_PX
						: 0
				return (
					<CommentCardView
						key={card.id}
						card={card}
						topPx={topPx}
						offsetY={offsetY}
						isActive={isActive}
						editor={editor}
						onActivate={() => onHoverAnnotation?.(isActive ? null : card.id)}
						onDeactivate={() => onHoverAnnotation?.(null)}
					/>
				)
			})}
		</div>
	)
}

// ─── Card view ──────────────────────────────────────────────────────────────

function CommentCardView({
	card,
	topPx,
	offsetY,
	isActive,
	editor,
	onActivate,
	onDeactivate,
}: {
	card: CommentCard
	topPx: number
	offsetY: number
	isActive: boolean
	editor: Editor
	onActivate: () => void
	onDeactivate: () => void
}) {
	const [reasonDraft, setReasonDraft] = useState(card.reason ?? "")
	const inputRef = useRef<HTMLTextAreaElement>(null)

	// Sync draft when card data changes (e.g. after saving)
	useEffect(() => {
		setReasonDraft(card.reason ?? "")
	}, [card.reason])

	// Auto-focus the textarea when the card becomes active
	useEffect(() => {
		if (isActive) {
			// Small delay to let the card expand first
			const id = setTimeout(() => inputRef.current?.focus(), 50)
			return () => clearTimeout(id)
		}
	}, [isActive])

	const hasContent =
		card.reason || card.comment || card.aoCategory || card.phrase

	const handleSaveReason = () => {
		const trimmed = reasonDraft.trim()
		if (trimmed !== (card.reason ?? "")) {
			updateMarkAttr(editor, card, {
				reason: trimmed || null,
			})
		}
	}

	const handleSentimentChange = (sentiment: string) => {
		updateMarkAttr(editor, card, { sentiment })
	}

	const handleDelete = () => {
		removeMark(editor, card)
		onDeactivate()
	}

	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: card activation is click-only by design
		<div
			className={cn(
				"absolute left-0 right-0 mx-1 rounded-md border bg-background px-2 py-1.5 text-[11px] leading-tight shadow-sm cursor-pointer",
				"transition-[transform,box-shadow,background-color,ring-color] duration-200 ease-out",
				isActive
					? "ring-2 ring-blue-300 bg-blue-50 dark:bg-blue-950/30 z-20 shadow-md"
					: "z-10",
			)}
			style={{
				top: `${topPx}px`,
				transform: offsetY ? `translateY(${offsetY}px)` : undefined,
			}}
			onClick={(e) => {
				if (isActive && (e.target as HTMLElement).closest("[data-card-editor]"))
					return
				onActivate()
			}}
		>
			{/* Header row — always visible */}
			<div className="flex items-center gap-1.5 mb-0.5">
				<span className="text-xs font-bold text-muted-foreground">
					{MARK_ICONS[card.markType] ?? "?"}
				</span>

				<span
					className={cn(
						"h-1.5 w-1.5 rounded-full shrink-0",
						SENTIMENT_DOT[card.sentiment] ?? SENTIMENT_DOT.neutral,
					)}
				/>

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

				{!hasContent && !isActive && (
					<span className="text-muted-foreground">
						{MARK_LABELS[card.markType] ?? card.markType}
					</span>
				)}
			</div>

			{/* Collapsed content */}
			{!isActive && (
				<>
					{card.reason && (
						<p className="text-muted-foreground line-clamp-2">{card.reason}</p>
					)}
					{card.comment && (
						<p className="text-foreground font-medium line-clamp-2">
							{card.comment}
						</p>
					)}
					{card.chainType && card.phrase && (
						<p className="text-muted-foreground italic">
							{card.chainType}: {card.phrase}
						</p>
					)}
				</>
			)}

			{/* Expanded editor — shown when active */}
			{isActive && (
				<div data-card-editor className="mt-1 space-y-1.5">
					{/* Sentiment pills */}
					<div className="flex items-center gap-1">
						{SENTIMENTS.map((s) => (
							<button
								key={s}
								type="button"
								onClick={(e) => {
									e.stopPropagation()
									handleSentimentChange(s)
								}}
								className={cn(
									"rounded-full px-1.5 py-0.5 text-[9px] font-medium capitalize transition-colors",
									card.sentiment === s
										? s === "positive"
											? "bg-green-500 text-white"
											: s === "negative"
												? "bg-red-500 text-white"
												: "bg-zinc-500 text-white"
										: "bg-muted text-muted-foreground hover:bg-muted/80",
								)}
							>
								{s}
							</button>
						))}
					</div>

					{/* Reason textarea */}
					<textarea
						ref={inputRef}
						value={reasonDraft}
						onChange={(e) => setReasonDraft(e.target.value)}
						onBlur={handleSaveReason}
						onKeyDown={(e) => {
							if (e.key === "Enter" && !e.shiftKey) {
								e.preventDefault()
								handleSaveReason()
								onDeactivate()
							}
							if (e.key === "Escape") {
								setReasonDraft(card.reason ?? "")
								onDeactivate()
							}
						}}
						placeholder="Add a reason..."
						className="w-full rounded border bg-background px-1.5 py-1 text-[11px] leading-snug resize-none focus:outline-none focus:ring-1 focus:ring-blue-300"
						rows={4}
					/>

					{/* Comment display (read-only from AI) */}
					{card.comment && (
						<p className="text-foreground font-medium text-[10px]">
							{card.comment}
						</p>
					)}

					{/* Delete button */}
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation()
							handleDelete()
						}}
						className="text-[10px] text-red-500 hover:text-red-600 font-medium"
					>
						Remove mark
					</button>
				</div>
			)}
		</div>
	)
}
