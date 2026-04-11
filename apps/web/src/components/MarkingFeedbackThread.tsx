"use client"

import type { MarkPointResult } from "@/lib/marking/types"
import { cn } from "@/lib/utils"
import { ChevronDown, ChevronUp } from "lucide-react"

// ─── Score colour helpers ────────────────────────────────────────────────────

type ScoreTier = "high" | "mid" | "low" | "ungraded"

function scoreTier(awarded: number, max: number): ScoreTier {
	if (max === 0) return "ungraded"
	const pct = awarded / max
	if (pct >= 0.7) return "high"
	if (pct >= 0.4) return "mid"
	return "low"
}

const TIER_BORDER: Record<ScoreTier, string> = {
	high: "border-green-400 dark:border-green-600",
	mid: "border-amber-400 dark:border-amber-600",
	low: "border-red-400 dark:border-red-500",
	ungraded: "border-border",
}

const TIER_SCORE_TEXT: Record<ScoreTier, string> = {
	high: "text-green-700 dark:text-green-400",
	mid: "text-amber-700 dark:text-amber-400",
	low: "text-red-700 dark:text-red-400",
	ungraded: "text-muted-foreground",
}

const TIER_DOT_FILLED: Record<ScoreTier, string> = {
	high: "bg-green-500",
	mid: "bg-amber-500",
	low: "bg-red-500",
	ungraded: "bg-muted-foreground",
}

// ─── Score dots ──────────────────────────────────────────────────────────────

function ScoreDots({
	awarded,
	max,
	tier,
}: {
	awarded: number
	max: number
	tier: ScoreTier
}) {
	if (max === 0 || max > 12) return null
	return (
		<span className="flex items-center gap-0.5">
			{Array.from({ length: max }).map((_, i) => (
				<span
					// biome-ignore lint/suspicious/noArrayIndexKey: static dot indicators
					key={i}
					className={cn(
						"inline-block size-2 rounded-full",
						i < awarded ? TIER_DOT_FILLED[tier] : "bg-muted",
					)}
				/>
			))}
		</span>
	)
}

// ─── Props ───────────────────────────────────────────────────────────────────

type Props = {
	questionId: string
	questionText: string
	questionNumber: string
	awardedScore: number
	maxScore: number
	feedbackSummary: string
	llmReasoning: string
	levelAwarded?: number
	markPointResults: MarkPointResult[]
	expanded: boolean
	isActive?: boolean
	isContinuation?: boolean
	onExpand: () => void
}

// ─── Continuation pill ───────────────────────────────────────────────────────

function ContinuationPill({
	questionNumber,
	awardedScore,
	maxScore,
	tier,
	onExpand,
}: {
	questionNumber: string
	awardedScore: number
	maxScore: number
	tier: ScoreTier
	onExpand: () => void
}) {
	return (
		<button
			type="button"
			onClick={onExpand}
			className={cn(
				"inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium shadow-sm transition-colors bg-background hover:bg-muted",
				TIER_BORDER[tier],
				TIER_SCORE_TEXT[tier],
			)}
		>
			<span className="text-muted-foreground">↑</span>
			<span>Q{questionNumber}</span>
			<span className="text-muted-foreground">—</span>
			<span className={TIER_SCORE_TEXT[tier]}>
				{awardedScore}/{maxScore}
			</span>
		</button>
	)
}

// ─── Main component ──────────────────────────────────────────────────────────

export function MarkingFeedbackThread({
	questionNumber,
	questionText,
	awardedScore,
	maxScore,
	feedbackSummary,
	llmReasoning,
	levelAwarded,
	markPointResults,
	expanded,
	isActive = false,
	isContinuation = false,
	onExpand,
}: Props) {
	const tier = scoreTier(awardedScore, maxScore)

	if (isContinuation) {
		return (
			<ContinuationPill
				questionNumber={questionNumber}
				awardedScore={awardedScore}
				maxScore={maxScore}
				tier={tier}
				onExpand={onExpand}
			/>
		)
	}

	return (
		<div
			className={cn(
				"w-full rounded-lg border bg-background text-left shadow-sm transition-shadow duration-200",
				isActive ? "shadow-lg" : "shadow-sm",
				TIER_BORDER[tier],
			)}
		>
			{/* Header — always clickable */}
			<button type="button" onClick={onExpand} className="w-full p-3 text-left">
				<div className="flex items-start justify-between gap-2">
					<div className="min-w-0 flex-1">
						<p className="text-xs font-semibold text-muted-foreground">
							Q{questionNumber}
						</p>
						<p className="truncate text-xs text-muted-foreground">
							{questionText}
						</p>
					</div>
					<div className="flex shrink-0 items-center gap-1.5">
						<span
							className={cn(
								"text-sm font-semibold tabular-nums",
								TIER_SCORE_TEXT[tier],
							)}
						>
							{awardedScore}/{maxScore}
						</span>
						{expanded ? (
							<ChevronUp className="size-3.5 text-muted-foreground" />
						) : (
							<ChevronDown className="size-3.5 text-muted-foreground" />
						)}
					</div>
				</div>

				{/* Collapsed preview */}
				{!expanded && (
					<p className="mt-1.5 line-clamp-2 text-xs text-foreground">
						{feedbackSummary || (
							<span className="italic text-muted-foreground">
								No feedback available
							</span>
						)}
					</p>
				)}
			</button>

			{/* Expanded content */}
			<div
				className={cn(
					"grid transition-[grid-template-rows] duration-300 ease-in-out",
					expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
				)}
			>
				<div className="min-h-0 overflow-hidden">
					<div className="space-y-3 border-t px-3 pb-3 pt-2.5">
						{/* Score + dots */}
						<div className="flex items-center gap-2">
							<ScoreDots awarded={awardedScore} max={maxScore} tier={tier} />
							{levelAwarded !== undefined && (
								<span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
									Level {levelAwarded}
								</span>
							)}
						</div>

						{/* Feedback */}
						{feedbackSummary && (
							<p className="text-sm text-foreground leading-relaxed">
								{feedbackSummary}
							</p>
						)}

						{/* Mark points */}
						{markPointResults.length > 0 && (
							<div className="space-y-1.5">
								<p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
									Mark points
								</p>
								{markPointResults.map((mp, i) => (
									// biome-ignore lint/suspicious/noArrayIndexKey: static mark point list
									<div key={i} className="flex items-start gap-2">
										<span
											className={cn(
												"mt-0.5 shrink-0 text-sm font-bold",
												mp.awarded
													? "text-green-600 dark:text-green-400"
													: "text-red-500 dark:text-red-400",
											)}
										>
											{mp.awarded ? "✓" : "✗"}
										</span>
										<div className="min-w-0 flex-1">
											<p className="text-xs text-foreground">
												{mp.expectedCriteria}
											</p>
											{mp.reasoning && (
												<p className="mt-0.5 text-xs text-muted-foreground">
													{mp.reasoning}
												</p>
											)}
										</div>
									</div>
								))}
							</div>
						)}

						{/* Examiner reasoning disclosure */}
						{llmReasoning && (
							<details className="group">
								<summary className="cursor-pointer list-none text-xs text-muted-foreground hover:text-foreground select-none flex items-center gap-1">
									<ChevronDown className="size-3 transition-transform group-open:rotate-180" />
									Examiner reasoning
								</summary>
								<p className="mt-1.5 rounded-md bg-muted px-2.5 py-2 text-xs text-muted-foreground leading-relaxed">
									{llmReasoning}
								</p>
							</details>
						)}
					</div>
				</div>
			</div>
		</div>
	)
}
