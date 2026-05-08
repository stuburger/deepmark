"use client"

import { Button } from "@/components/ui/button"
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import type { JobStages } from "@/lib/marking/stages/types"
import { cn } from "@/lib/utils"
import {
	type BoundaryMode,
	type GradeBoundary,
	computeGrade,
} from "@mcp-gcse/shared"
import { AlertCircle, Ban, Check, CheckCircle2, Loader2 } from "lucide-react"
import { useStageData } from "./use-stage-data"

type StatusBadgeState =
	| "extracting"
	| "grading"
	| "ready_to_confirm"
	| "confirmed"
	| "failed"
	| "cancelled"

function deriveState(
	stages: JobStages,
	isConfirmed: boolean,
): StatusBadgeState {
	const { ocr, grading } = stages
	if (ocr.status === "failed" || grading.status === "failed") return "failed"
	if (ocr.status === "cancelled" || grading.status === "cancelled") {
		return "cancelled"
	}
	if (ocr.status !== "done") return "extracting"
	if (grading.status !== "done") return "grading"
	return isConfirmed ? "confirmed" : "ready_to_confirm"
}

type ScoreSummary = {
	awarded: number
	max: number
	grade: string | null
}

function ScoreInline({ awarded, max, grade }: ScoreSummary) {
	if (max === 0) return null
	return (
		<span className="ml-2 inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold tabular-nums">
			<span className="opacity-60">·</span>
			<span>
				{awarded}/{max}
			</span>
			{grade && (
				<>
					<span className="opacity-60">·</span>
					<span>Grade {grade}</span>
				</>
			)}
		</span>
	)
}

/**
 * Single state-aware widget that subsumes StagePips + Confirm button +
 * Score/Grade badges. Reads JobStages directly to distinguish extracting
 * from grading; phase summary is unnecessary because the per-stage status
 * carries strictly more information.
 *
 * Six states: extracting, grading, ready_to_confirm, confirmed, failed,
 * cancelled. Ready / confirmed render the score + grade inline.
 */
export function StatusBadge({
	jobId,
	isConfirmed,
	onConfirm,
	isPending,
	totalAwarded,
	totalMax,
	gradeBoundaries,
	gradeBoundaryMode,
	readOnly,
}: {
	jobId: string
	isConfirmed: boolean
	onConfirm: () => void
	isPending: boolean
	totalAwarded: number
	totalMax: number
	gradeBoundaries: GradeBoundary[] | null
	gradeBoundaryMode: BoundaryMode | null
	readOnly: boolean
}) {
	const stages = useStageData(jobId)
	if (!stages) return null

	const state = deriveState(stages, isConfirmed)

	const score: ScoreSummary = {
		awarded: totalAwarded,
		max: totalMax,
		grade: computeGrade(
			totalAwarded,
			totalMax,
			gradeBoundaries,
			gradeBoundaryMode ?? "percent",
		),
	}

	if (state === "extracting" || state === "grading") {
		const label = state === "extracting" ? "Extracting" : "Grading"
		return (
			<span
				className={cn(
					"inline-flex h-8 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-medium text-muted-foreground",
				)}
				aria-live="polite"
			>
				<Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
				{label}
			</span>
		)
	}

	if (state === "ready_to_confirm") {
		if (readOnly) {
			return (
				<Tooltip>
					<TooltipTrigger
						render={
							<span
								className={cn(
									"inline-flex h-8 items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 text-sm font-medium text-primary",
								)}
							>
								<Check className="h-3.5 w-3.5" />
								Ready to confirm
								<ScoreInline {...score} />
							</span>
						}
					/>
					<TooltipContent side="bottom" sideOffset={6}>
						You have viewer access — confirm action is disabled
					</TooltipContent>
				</Tooltip>
			)
		}

		return (
			<Button
				type="button"
				variant="confirm"
				onClick={onConfirm}
				disabled={isPending}
				aria-label="Confirm marking"
				className="h-8 px-3"
			>
				{isPending ? (
					<Loader2 className="h-3.5 w-3.5 animate-spin" />
				) : (
					<Check className="h-3.5 w-3.5" />
				)}
				Confirm marking
				<ScoreInline {...score} />
			</Button>
		)
	}

	if (state === "confirmed") {
		const trigger = (
			<Button
				type="button"
				variant="outline"
				onClick={readOnly ? undefined : onConfirm}
				disabled={readOnly || isPending}
				aria-pressed
				aria-label={readOnly ? "Confirmed" : "Unconfirm marking"}
				className={cn(
					"h-8 px-3 border-success-300 bg-success-50 text-success-800",
					!readOnly &&
						"hover:bg-success-100 hover:text-success-900 hover:border-success-400",
				)}
			>
				{isPending ? (
					<Loader2 className="h-3.5 w-3.5 animate-spin" />
				) : (
					<CheckCircle2 className="h-3.5 w-3.5" />
				)}
				Confirmed
				<ScoreInline {...score} />
			</Button>
		)

		if (readOnly) return trigger

		return (
			<Tooltip>
				<TooltipTrigger render={trigger} />
				<TooltipContent side="bottom" sideOffset={6}>
					Click to unconfirm
				</TooltipContent>
			</Tooltip>
		)
	}

	if (state === "failed") {
		const error = stages.ocr.error ?? stages.grading.error ?? null
		return (
			<Tooltip>
				<TooltipTrigger
					render={
						<span
							className={cn(
								"inline-flex h-8 items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 text-sm font-medium text-destructive",
							)}
						>
							<AlertCircle className="h-3.5 w-3.5" />
							Failed
						</span>
					}
				/>
				<TooltipContent side="bottom" sideOffset={6}>
					{error ?? "Pipeline failed — use re-run to retry"}
				</TooltipContent>
			</Tooltip>
		)
	}

	// state === "cancelled"
	return (
		<span
			className={cn(
				"inline-flex h-8 items-center gap-2 rounded-md border border-border bg-muted px-3 text-sm font-medium text-muted-foreground",
			)}
		>
			<Ban className="h-3.5 w-3.5" />
			Cancelled
		</span>
	)
}
