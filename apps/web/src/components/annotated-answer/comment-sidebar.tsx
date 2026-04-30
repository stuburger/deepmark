"use client"

import { TIPTAP_TO_ENTRY } from "@mcp-gcse/shared"
import type { Editor } from "@tiptap/core"
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react"
import { CommentCardView } from "./comment-card-view"

// ─── Types ──────────────────────────────────────────────────────────────────

export type CommentCard = {
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

// ─── Component ──────────────────────────────────────────────────────────────

export function CommentSidebar({
	editor,
	activeAnnotationId,
	onActiveAnnotationChange,
}: {
	editor: Editor
	activeAnnotationId?: string | null
	onActiveAnnotationChange?: (annotationId: string | null) => void
}) {
	const [rawCards, setRawCards] = useState<CommentCard[]>([])
	const containerRef = useRef<HTMLDivElement>(null)

	const recompute = useCallback(() => {
		const { doc } = editor.state

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

			if (annotationId) {
				// annotationId is authoritative — same id = same annotation,
				// even when PM splits the mark across text nodes because of an
				// intervening non-text node (hardBreak, inline embed). Merge
				// unconditionally and take the bounding range so the card
				// anchors at the start and click-to-select covers the whole
				// annotation.
				const existing = merged.get(annotationId)
				if (existing) {
					existing.from = Math.min(existing.from, frag.from)
					existing.to = Math.max(existing.to, frag.to)
				} else {
					merged.set(annotationId, { ...frag })
				}
				continue
			}

			// No annotationId — fall back to content fingerprint. Two
			// fragments with identical fingerprints at non-contiguous
			// positions are treated as separate annotations; we can't prove
			// otherwise without a stable id.
			const fingerprint = `${frag.markType}|${frag.attrs.sentiment ?? ""}|${frag.attrs.reason ?? ""}|${frag.attrs.comment ?? ""}`
			const existing = merged.get(fingerprint)
			if (existing && frag.from <= existing.to) {
				existing.to = Math.max(existing.to, frag.to)
			} else if (!existing) {
				merged.set(fingerprint, { ...frag })
			} else {
				merged.set(`${fingerprint}@${frag.from}`, { ...frag })
			}
		}

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

	const activeIdx = activeAnnotationId
		? positioned.findIndex(({ card }) => card.id === activeAnnotationId)
		: -1
	const activeTopPx = activeIdx >= 0 ? positioned[activeIdx].topPx : 0

	return (
		<div ref={containerRef} className="relative w-full min-h-full">
			{positioned.map(({ card, topPx }, idx) => {
				const isActive = activeAnnotationId === card.id
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
						onActivate={() => {
							if (isActive) {
								onActiveAnnotationChange?.(null)
								return
							}
							// Set active id directly. We deliberately don't roundtrip
							// through `editor.commands.setTextSelection(card.from)`:
							// the plugin reads `$pos.marks()` at the selection
							// boundary, which doesn't reliably resolve the annotation
							// mark when the cursor lands at the very start of the
							// marked text — the plugin would then call back with
							// `null` and wipe the activation we just set. Cursor-in-
							// mark activation still flows through the plugin when the
							// user moves the editor caret naturally.
							onActiveAnnotationChange?.(card.id)
						}}
						onDeactivate={() => onActiveAnnotationChange?.(null)}
					/>
				)
			})}
		</div>
	)
}
