"use client"

import { aoLabel, aoPillClass, aoQualityClass } from "@/lib/marking/ao-palette"
import { cn } from "@/lib/utils"
import type { Editor } from "@tiptap/core"
import { useEffect, useRef, useState } from "react"
import type { CommentCard } from "./comment-sidebar"

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
	positive: "bg-success",
	negative: "bg-destructive",
	neutral: "bg-zinc-400",
}

const SENTIMENTS = ["positive", "neutral", "negative"] as const

export function updateMarkAttr(
	editor: Editor,
	card: CommentCard,
	attrs: Record<string, unknown>,
) {
	const markType = editor.schema.marks[card.markType]
	if (!markType) return

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

export function removeMark(editor: Editor, card: CommentCard) {
	const markType = editor.schema.marks[card.markType]
	if (!markType) return

	const tr = editor.state.tr.removeMark(card.from, card.to, markType)
	editor.view.dispatch(tr)
}

export type CommentCardViewProps = {
	card: CommentCard
	topPx: number
	offsetY: number
	isActive: boolean
	editor: Editor
	onActivate: () => void
	onDeactivate: () => void
}

export function CommentCardView({
	card,
	topPx,
	offsetY,
	isActive,
	editor,
	onActivate,
	onDeactivate,
}: CommentCardViewProps) {
	const [reasonDraft, setReasonDraft] = useState(card.reason ?? "")
	const cardRef = useRef<HTMLDivElement>(null)
	const wasActiveRef = useRef(false)

	useEffect(() => {
		setReasonDraft(card.reason ?? "")
	}, [card.reason])

	useEffect(() => {
		if (isActive && !wasActiveRef.current && !editor.isFocused) {
			cardRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })
		}
		wasActiveRef.current = isActive
	}, [isActive, editor])

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
			ref={cardRef}
			className={cn(
				"absolute left-0 right-0 mx-1 rounded-md border bg-background px-2 py-1.5 text-[11px] leading-tight shadow-sm cursor-pointer",
				"transition-[transform,box-shadow,background-color,ring-color] duration-200 ease-out",
				isActive
					? "ring-2 ring-primary/40 bg-teal-50 dark:bg-teal-950/30 z-20 shadow-md"
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

			{isActive && (
				<div data-card-editor className="mt-1 space-y-1.5">
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
											? "bg-success text-white"
											: s === "negative"
												? "bg-destructive text-white"
												: "bg-zinc-500 text-white"
										: "bg-muted text-muted-foreground hover:bg-muted/80",
								)}
							>
								{s}
							</button>
						))}
					</div>

					<textarea
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
						className="w-full rounded border bg-background px-1.5 py-1 text-[11px] leading-snug resize-none focus:outline-none focus:ring-1 focus:ring-primary/40"
						rows={4}
					/>

					{card.comment && (
						<p className="text-foreground font-medium text-[10px]">
							{card.comment}
						</p>
					)}

					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation()
							handleDelete()
						}}
						className="text-[10px] text-destructive hover:text-error-600 font-medium"
					>
						Remove mark
					</button>
				</div>
			)}
		</div>
	)
}
