"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover"
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import { UngradedBadge } from "@/components/ungraded-badge"
import type { ResolvedOverride } from "@/lib/marking/overrides/resolve"
import { cn } from "@/lib/utils"
import { Pencil, RotateCcw } from "lucide-react"
import { type ReactNode, useEffect, useRef, useState } from "react"

type Props = {
	/**
	 * AI's awarded score. `null` while grading is still in progress for this
	 * question — the badge renders `?/N` (white bg, black border) instead of
	 * `0/N` so a "not graded yet" state isn't visually confused with a real zero.
	 */
	aiScore: number | null
	maxScore: number
	/**
	 * The resolved override (doc-wins-over-PG) for this question, or `null`
	 * when accepting the AI's score. The editor only reads `score_override`
	 * and `reason`; `feedback_override` is preserved by the caller's `onSave`
	 * if needed (separate `FeedbackOverrideEditor` writes it).
	 */
	override: ResolvedOverride | null
	onSave: (score: number, reason: string | null) => void
	onReset: () => void
	/**
	 * Optional custom display node for the trigger. Lets callers style the
	 * score however they like (e.g. MCQ rows use colored text, not a pill).
	 * If omitted, renders the default pill badge with a tooltip when overridden.
	 */
	renderDisplay?: (args: {
		effectiveScore: number | null
		isOverridden: boolean
	}) => ReactNode
}

/**
 * Click the score to open a small popover containing the numeric input. The
 * popover commits the value on close (click-outside, Enter, focus move).
 * Escape and the reset button close without committing — reset also clears
 * the override.
 *
 * The trigger stops mouse/click propagation so it can be nested inside
 * other clickable rows (e.g. the MCQ Popover row) without triggering them.
 */
export function ScoreOverrideEditor({
	aiScore,
	maxScore,
	override,
	onSave,
	onReset,
	renderDisplay,
}: Props) {
	const effectiveScore = override?.score_override ?? aiScore
	const isOverridden = override !== null

	const [open, setOpen] = useState(false)
	const [score, setScore] = useState(effectiveScore ?? 0)
	const inputRef = useRef<HTMLInputElement>(null)
	const skipCommitRef = useRef(false)

	// Keep the input value in sync when the external score changes (e.g.
	// optimistic mutation landed, or AI re-grade).
	useEffect(() => {
		setScore(override?.score_override ?? aiScore ?? 0)
	}, [override?.score_override, aiScore])

	// Auto-select the number when the popover opens so typing replaces it.
	useEffect(() => {
		if (open) {
			requestAnimationFrame(() => inputRef.current?.select())
		}
	}, [open])

	function commit() {
		const clamped = Math.max(0, Math.min(maxScore, score))
		if (clamped !== effectiveScore) {
			onSave(clamped, override?.reason ?? null)
		}
	}

	function handleOpenChange(next: boolean) {
		if (!next) {
			if (skipCommitRef.current) {
				skipCommitRef.current = false
			} else {
				commit()
			}
		}
		setOpen(next)
	}

	function handleReset() {
		skipCommitRef.current = true
		onReset()
		setOpen(false)
	}

	let displayNode: ReactNode
	if (renderDisplay) {
		displayNode = renderDisplay({ effectiveScore, isOverridden })
	} else if (effectiveScore === null) {
		displayNode = <UngradedBadge maxScore={maxScore} />
	} else {
		displayNode = (
			<DefaultBadge
				effectiveScore={effectiveScore}
				maxScore={maxScore}
				override={override}
				aiScore={aiScore ?? 0}
			/>
		)
	}

	return (
		<Popover open={open} onOpenChange={handleOpenChange}>
			{/* nativeButton={false} — the trigger is a <span> on purpose so the
			    badge can nest inside other clickable rows (e.g. MCQ rows) without
			    forming an invalid <button>-in-<button>. We accept the loss of
			    native button semantics; keyboard activation is wired manually. */}
			<PopoverTrigger
				nativeButton={false}
				render={
					<span
						role="button"
						tabIndex={0}
						className="shrink-0 cursor-pointer"
						onMouseDown={(e) => e.stopPropagation()}
						onClick={(e) => e.stopPropagation()}
						onKeyDown={(e) => {
							if (e.key === "Enter" || e.key === " ") {
								e.stopPropagation()
							}
						}}
						title="Click to edit score"
					>
						{displayNode}
					</span>
				}
			/>
			<PopoverContent
				side="bottom"
				align="end"
				className="w-auto p-2"
				onMouseDown={(e) => e.stopPropagation()}
				onClick={(e) => e.stopPropagation()}
			>
				<div className="flex items-center gap-2">
					<Input
						ref={inputRef}
						type="number"
						min={0}
						max={maxScore}
						value={score}
						onChange={(e) => setScore(Number(e.target.value))}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								e.preventDefault()
								setOpen(false)
							}
							if (e.key === "Escape") {
								e.preventDefault()
								skipCommitRef.current = true
								setScore(effectiveScore ?? 0)
								setOpen(false)
							}
						}}
						className="h-7 w-14 text-sm text-center tabular-nums"
					/>
					<span className="text-xs text-muted-foreground">/ {maxScore}</span>
					{isOverridden && (
						<Button
							variant="ghost"
							size="icon-xs"
							onClick={handleReset}
							className="text-muted-foreground hover:text-destructive"
							title="Reset to AI score"
						>
							<RotateCcw className="h-3 w-3" />
						</Button>
					)}
				</div>
			</PopoverContent>
		</Popover>
	)
}

function DefaultBadge({
	effectiveScore,
	maxScore,
	override,
	aiScore,
}: {
	effectiveScore: number
	maxScore: number
	override: ResolvedOverride | null
	aiScore: number
}) {
	const pct = maxScore > 0 ? effectiveScore / maxScore : 0
	const color = override
		? "bg-blue-500"
		: pct >= 0.7
			? "bg-green-500"
			: pct >= 0.4
				? "bg-amber-500"
				: "bg-red-500"

	const badge = (
		<span
			className={cn(
				"inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold text-white tabular-nums",
				color,
			)}
		>
			{override && <Pencil className="h-2.5 w-2.5" />}
			{effectiveScore}/{maxScore}
		</span>
	)

	if (!override) return badge

	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger render={badge} />
				<TooltipContent>
					{override.reason && (
						<p className="text-xs">
							<span className="font-medium">Reason:</span> {override.reason}
						</p>
					)}
					<p className="text-xs text-muted-foreground mt-0.5">
						AI score: {aiScore}/{maxScore}
					</p>
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	)
}
