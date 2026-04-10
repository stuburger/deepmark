"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { Pencil, RotateCcw } from "lucide-react"
import { useEffect, useState } from "react"

export function ScoreOverrideEditor({
	aiScore,
	maxScore,
	override,
	isEditing,
	onSave,
	onReset,
}: {
	aiScore: number
	maxScore: number
	override: { score_override: number; reason: string | null } | null
	isEditing: boolean
	onSave: (score: number, reason: string | null) => void
	onReset: () => void
}) {
	const effectiveScore = override?.score_override ?? aiScore
	const [score, setScore] = useState(effectiveScore)
	const [reason, setReason] = useState(override?.reason ?? "")

	// Sync local state when override changes externally
	useEffect(() => {
		setScore(override?.score_override ?? aiScore)
		setReason(override?.reason ?? "")
	}, [override?.score_override, override?.reason, aiScore])

	function handleScoreBlur() {
		const clamped = Math.max(0, Math.min(maxScore, score))
		if (
			clamped !== effectiveScore ||
			reason.trim() !== (override?.reason ?? "")
		) {
			onSave(clamped, reason.trim() || null)
		}
	}

	function handleReasonBlur() {
		if (override && reason.trim() !== (override.reason ?? "")) {
			onSave(score, reason.trim() || null)
		}
	}

	if (isEditing) {
		return (
			<div className="flex items-center gap-2 shrink-0">
				<Input
					type="number"
					min={0}
					max={maxScore}
					value={score}
					onChange={(e) => setScore(Number(e.target.value))}
					onBlur={handleScoreBlur}
					className="h-7 w-16 text-sm text-center tabular-nums"
				/>
				<span className="text-xs text-muted-foreground">/ {maxScore}</span>
				{override && (
					<Button
						variant="ghost"
						size="icon-xs"
						onClick={onReset}
						className="text-muted-foreground hover:text-destructive"
						title="Reset to AI score"
					>
						<RotateCcw className="h-3 w-3" />
					</Button>
				)}
			</div>
		)
	}

	// Read-only badge
	const pct = maxScore > 0 ? effectiveScore / maxScore : 0
	const color = override
		? "bg-blue-500"
		: pct >= 0.7
			? "bg-green-500"
			: pct >= 0.4
				? "bg-amber-500"
				: "bg-red-500"

	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger>
					<span
						className={cn(
							"inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold text-white tabular-nums",
							color,
						)}
					>
						{override && <Pencil className="h-2.5 w-2.5" />}
						{effectiveScore}/{maxScore}
					</span>
				</TooltipTrigger>
				{override && (
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
				)}
			</Tooltip>
		</TooltipProvider>
	)
}
