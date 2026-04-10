"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { Pencil, RotateCcw, X } from "lucide-react"
import { useState } from "react"

export function ScoreOverrideEditor({
	aiScore,
	maxScore,
	override,
	onSave,
	onReset,
}: {
	aiScore: number
	maxScore: number
	override: { score_override: number; reason: string } | null
	onSave: (score: number, reason: string) => void
	onReset: () => void
}) {
	const [editing, setEditing] = useState(false)
	const [score, setScore] = useState(override?.score_override ?? aiScore)
	const [reason, setReason] = useState(override?.reason ?? "")

	const effectiveScore = override?.score_override ?? aiScore
	const pct = maxScore > 0 ? effectiveScore / maxScore : 0
	const color = override
		? "bg-blue-500"
		: pct >= 0.7
			? "bg-green-500"
			: pct >= 0.4
				? "bg-amber-500"
				: "bg-red-500"

	function handleSave() {
		if (!reason.trim()) return
		onSave(score, reason.trim())
		setEditing(false)
	}

	function handleCancel() {
		setScore(override?.score_override ?? aiScore)
		setReason(override?.reason ?? "")
		setEditing(false)
	}

	function handleStartEdit() {
		setScore(override?.score_override ?? aiScore)
		setReason(override?.reason ?? "")
		setEditing(true)
	}

	if (editing) {
		return (
			<div className="space-y-2 rounded-lg border bg-muted/30 p-3">
				<div className="flex items-center gap-2">
					<label className="text-xs font-medium text-muted-foreground">
						Score
					</label>
					<Input
						type="number"
						min={0}
						max={maxScore}
						value={score}
						onChange={(e) => setScore(Number(e.target.value))}
						className="h-7 w-20 text-sm"
						autoFocus
					/>
					<span className="text-xs text-muted-foreground">/ {maxScore}</span>
				</div>
				<div className="space-y-1">
					<label className="text-xs font-medium text-muted-foreground">
						Reason (required)
					</label>
					<Textarea
						value={reason}
						onChange={(e) => setReason(e.target.value)}
						placeholder="Why are you changing this score?"
						className="text-sm min-h-16 resize-y"
					/>
				</div>
				<div className="flex items-center gap-2">
					<Button
						size="sm"
						disabled={!reason.trim() || score < 0 || score > maxScore}
						onClick={handleSave}
					>
						Save
					</Button>
					<Button size="sm" variant="ghost" onClick={handleCancel}>
						Cancel
					</Button>
				</div>
			</div>
		)
	}

	return (
		<TooltipProvider>
			<div className="group/score inline-flex items-center gap-1">
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
							<p className="text-xs">
								<span className="font-medium">Teacher override:</span>{" "}
								{override.reason}
							</p>
							<p className="text-xs text-muted-foreground mt-0.5">
								AI score: {aiScore}/{maxScore}
							</p>
						</TooltipContent>
					)}
				</Tooltip>
				<button
					type="button"
					onClick={handleStartEdit}
					className="opacity-0 group-hover/score:opacity-100 rounded p-0.5 text-muted-foreground hover:text-foreground transition-all"
					title="Override score"
				>
					<Pencil className="h-3 w-3" />
				</button>
				{override && (
					<button
						type="button"
						onClick={onReset}
						className="opacity-0 group-hover/score:opacity-100 rounded p-0.5 text-muted-foreground hover:text-destructive transition-all"
						title="Reset to AI score"
					>
						<RotateCcw className="h-3 w-3" />
					</button>
				)}
			</div>
		</TooltipProvider>
	)
}
